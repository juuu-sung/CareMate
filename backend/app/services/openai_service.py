import json
from urllib import error, request

from app.core.config import settings
from app.schemas.chat import CareMode, ChatIntent, ChatSourceItem

OPENAI_API_URL = "https://api.openai.com/v1/responses"
DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"


class OpenAIServiceError(RuntimeError):
    pass


def generate_chat_text(
    intent: ChatIntent,
    user_text: str,
    mode: CareMode,
    grounded_hint: str | None = None,
    elder_profile_context: str | None = None,
) -> str:
    if not settings.openai_api_key:
        raise OpenAIServiceError("OPENAI_API_KEY is not configured.")

    model = settings.llm_model or DEFAULT_OPENAI_MODEL
    developer_prompt = _build_developer_prompt(
        intent=intent,
        mode=mode,
        grounded_hint=grounded_hint,
        elder_profile_context=elder_profile_context,
    )

    payload = {
        "model": model,
        "input": [
            {
                "role": "developer",
                "content": developer_prompt,
            },
            {
                "role": "user",
                "content": user_text,
            },
        ],
    }

    if model.startswith(("gpt-5", "o3", "o4")):
        payload["reasoning"] = {"effort": "low"}

    req = request.Request(
        OPENAI_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.openai_api_key}",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=settings.llm_timeout_seconds) as response:
            body = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise OpenAIServiceError(
            f"OpenAI request failed with status {exc.code}: {detail}"
        ) from exc
    except error.URLError as exc:
        raise OpenAIServiceError(f"OpenAI request failed: {exc.reason}") from exc

    output_text = _extract_output_text(body)
    if not output_text:
        raise OpenAIServiceError("OpenAI response did not include output text.")

    return output_text.strip()


def generate_place_status_summary(
    place_name: str,
    address: str | None = None,
    phone: str | None = None,
    place_url: str | None = None,
) -> tuple[str, list[ChatSourceItem]]:
    if not settings.openai_api_key:
        raise OpenAIServiceError("OPENAI_API_KEY is not configured.")

    model = settings.llm_model or DEFAULT_OPENAI_MODEL
    query_context = "\n".join(
        [
            f"병원명: {place_name}",
            f"주소: {address or '없음'}",
            f"전화번호: {phone or '없음'}",
            f"장소 링크: {place_url or '없음'}",
        ]
    )

    payload = {
        "model": model,
        "input": [
            {
                "role": "developer",
                "content": (
                    "당신은 CareMate 웹 확인 도우미입니다.\n"
                    "한국어로만 답합니다.\n"
                    "병원 또는 응급실의 현재 영업 여부를 최신 웹 정보를 바탕으로 짧게 요약합니다.\n"
                    "확실하지 않으면 단정하지 말고 '웹에서 명확히 확인되지 않았어요'처럼 말합니다.\n"
                    "첫 문장은 현재 영업 여부 또는 확인 불가 여부를 1문장으로 말합니다.\n"
                    "둘째 문장에는 확인한 근거를 아주 짧게 말합니다.\n"
                    "출처는 응답 본문에 길게 나열하지 않습니다."
                ),
            },
            {
                "role": "user",
                "content": (
                    "아래 병원의 현재 영업 여부를 웹에서 확인해 주세요.\n"
                    "병원 공식 웹사이트, 지도 상세 페이지, 예약/병원 안내 페이지를 우선 참고하세요.\n"
                    "영업시간이 오늘 기준인지, 현재 영업 중인지, 확인이 애매한지도 구분해 주세요.\n"
                    f"{query_context}"
                ),
            },
        ],
        "tools": [{"type": "web_search_preview"}],
    }

    if model.startswith(("gpt-5", "o3", "o4")):
        payload["reasoning"] = {"effort": "low"}

    req = request.Request(
        OPENAI_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.openai_api_key}",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=settings.llm_timeout_seconds) as response:
            body = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise OpenAIServiceError(
            f"OpenAI web search request failed with status {exc.code}: {detail}"
        ) from exc
    except error.URLError as exc:
        raise OpenAIServiceError(
            f"OpenAI web search request failed: {exc.reason}"
        ) from exc

    output_text = _extract_output_text(body)
    if not output_text:
        raise OpenAIServiceError("OpenAI web search response did not include output text.")

    return output_text.strip(), _extract_url_citations(body)


def _build_developer_prompt(
    intent: ChatIntent,
    mode: CareMode,
    grounded_hint: str | None,
    elder_profile_context: str | None = None,
) -> str:
    mode_instruction = {
        "basic": "짧고 자연스럽게 답변합니다.",
        "cognitive_support": "더 짧고 쉬운 문장으로 한 번에 한 가지 정보만 답변합니다.",
        "health_support": "건강, 일정, 복약 맥락을 우선하고 필요한 확인을 부드럽게 제안합니다.",
    }[mode]

    base_rules = [
        "당신은 고령 사용자를 돕는 CareMate AI입니다.",
        "항상 한국어로 답변합니다.",
        "문장은 짧고 쉬워야 합니다.",
        "의료 진단이나 응급 판정은 하지 않습니다.",
        "확실하지 않으면 단정하지 말고 짧게 안내합니다.",
        "사용자 프로필 정보는 참고용으로만 사용합니다.",
        "사용자가 직접 묻지 않은 개인정보를 매 답변마다 반복해서 드러내지 않습니다.",
        "증상, 약, 건강 상태, 병원 관련 질문에서는 프로필 정보를 우선 참고합니다.",
        mode_instruction,
    ]

    if elder_profile_context:
        base_rules.append("")
        base_rules.append("[어르신 프로필 정보]")
        base_rules.append(elder_profile_context)

    if mode == "health_support":
        base_rules.extend(
            [
                "건강 관련 첫 답변은 2문장 또는 3문장 이내로 답합니다.",
                "첫 문장에서는 짧게 공감하고 바로 쉬운 행동 1가지만 안내합니다.",
                "위험 신호 안내가 필요하면 한 문장으로만 짧게 덧붙입니다.",
                "여러 개의 불릿, 긴 체크리스트, 3개 이상의 지시를 한 번에 주지 않습니다.",
                "추가 확인이 필요하면 마지막에 질문은 1개만 합니다.",
            ]
        )

    if intent == "small_talk":
        base_rules.append("정서적 공감 표현을 먼저 하고, 부담 없는 한 문장을 추가합니다.")
    elif intent in {"symptom_support", "hospital_visit_support", "nearby_hospital_request"}:
        base_rules.extend(
            [
                "건강지원 답변은 짧은 공감, 쉬운 다음 행동, 짧은 확인 질문 순서로 답합니다.",
                "첫 답변에서 한 번에 여러 지시를 나열하지 않습니다.",
            ]
        )
    elif intent == "general_support":
        base_rules.extend(
            [
                "생활지원형 말투로만 답변하고 과도하게 길게 설명하지 않습니다.",
                "증상 호소에는 설명보다 짧은 안심, 쉬운 다음 행동, 짧은 확인 질문 순서로 답합니다.",
                "예: '머리가 아프시군요. 우선 조용한 곳에서 잠깐 쉬어보세요. 열이나 어지러움도 있나요?' 같은 길이를 기준으로 합니다.",
            ]
        )
    elif intent in {"schedule_lookup", "medication_lookup"} and grounded_hint:
        base_rules.append("아래 사실을 바탕으로만 답변합니다.")
        base_rules.append(f"사실: {grounded_hint}")

    return "\n".join(base_rules)


def _extract_output_text(body: dict) -> str:
    output_text = body.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    for item in body.get("output", []):
        if item.get("type") != "message":
            continue

        for content in item.get("content", []):
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                return content["text"]

    return ""


def _extract_url_citations(body: dict) -> list[ChatSourceItem]:
    sources: list[ChatSourceItem] = []
    seen_urls: set[str] = set()

    for item in body.get("output", []):
        if item.get("type") != "message":
            continue

        for content in item.get("content", []):
            for annotation in content.get("annotations", []) or []:
                if annotation.get("type") != "url_citation":
                    continue

                url = str(annotation.get("url") or "").strip()
                if not url or url in seen_urls:
                    continue

                seen_urls.add(url)
                title = str(annotation.get("title") or url).strip()
                sources.append(ChatSourceItem(title=title, url=url))

    return sources