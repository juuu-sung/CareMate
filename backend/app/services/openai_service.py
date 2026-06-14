import json
import re
from urllib import error, request

from app.core.config import settings
from app.schemas.agent import AgentAction
from app.schemas.chat import CareMode, ChatIntent, ChatSourceItem, RequesterRole

OPENAI_API_URL = "https://api.openai.com/v1/responses"
DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"


class OpenAIServiceError(RuntimeError):
    pass


def generate_chat_text(
    intent: ChatIntent,
    user_text: str,
    mode: CareMode,
    requester_role: RequesterRole,
    grounded_hint: str | None = None,
    elder_profile_context: str | None = None,
    recent_messages: list[dict[str, str]] | None = None,
) -> str:
    if not settings.openai_api_key:
        raise OpenAIServiceError("OPENAI_API_KEY is not configured.")

    model = settings.llm_model or DEFAULT_OPENAI_MODEL
    developer_prompt = _build_developer_prompt(
        intent=intent,
        mode=mode,
        requester_role=requester_role,
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
            *_normalize_recent_messages(recent_messages),
            {
                "role": "user",
                "content": user_text,
            },
        ],
    }

    _apply_reasoning_settings(payload, model)

    body = _post_responses_api(payload, failure_prefix="OpenAI request failed")

    output_text = _extract_output_text(body)
    if not output_text:
        raise OpenAIServiceError("OpenAI response did not include output text.")

    return output_text.strip()


def classify_chat_action(
    user_text: str,
    mode: CareMode,
    requester_role: RequesterRole,
    recent_messages: list[dict[str, str]] | None = None,
    elder_profile_context: str | None = None,
) -> dict:
    if not settings.openai_api_key:
        raise OpenAIServiceError("OPENAI_API_KEY is not configured.")

    model = settings.llm_model or DEFAULT_OPENAI_MODEL
    payload = {
        "model": model,
        "input": [
            {
                "role": "developer",
                "content": _build_classifier_prompt(
                    mode=mode,
                    requester_role=requester_role,
                    elder_profile_context=elder_profile_context,
                ),
            },
            *_normalize_recent_messages(recent_messages),
            {
                "role": "user",
                "content": user_text,
            },
        ],
    }

    _apply_reasoning_settings(payload, model)

    body = _post_responses_api(payload, failure_prefix="OpenAI classification request failed")
    output_text = _extract_output_text(body)
    if not output_text:
        raise OpenAIServiceError("OpenAI classification response did not include output text.")

    result = _extract_json_object(output_text)
    if not isinstance(result, dict):
        raise OpenAIServiceError("OpenAI classification response was not valid JSON.")

    return result


def generate_web_search_answer(
    user_text: str,
    mode: CareMode,
    recent_messages: list[dict[str, str]] | None = None,
) -> tuple[str, list[ChatSourceItem]]:
    if not settings.openai_api_key:
        raise OpenAIServiceError("OPENAI_API_KEY is not configured.")

    model = settings.llm_model or DEFAULT_OPENAI_MODEL
    payload = {
        "model": model,
        "input": [
            {
                "role": "developer",
                "content": _build_web_search_prompt(mode),
            },
            *_normalize_recent_messages(recent_messages),
            {
                "role": "user",
                "content": user_text,
            },
        ],
        "tools": [{"type": "web_search_preview"}],
    }

    _apply_reasoning_settings(payload, model)

    body = _post_responses_api(payload, failure_prefix="OpenAI web search request failed")
    output_text = _extract_output_text(body)

    if not output_text:
        raise OpenAIServiceError("OpenAI web search response did not include output text.")

    return output_text.strip(), _extract_url_citations(body)


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

    _apply_reasoning_settings(payload, model)

    body = _post_responses_api(payload, failure_prefix="OpenAI web search request failed")

    output_text = _extract_output_text(body)
    if not output_text:
        raise OpenAIServiceError("OpenAI web search response did not include output text.")

    return output_text.strip(), _extract_url_citations(body)


def summarize_guardian_conversation_days(
    days: list[dict[str, object]],
) -> dict[str, dict[str, object]]:
    if not settings.openai_api_key:
        raise OpenAIServiceError("OPENAI_API_KEY is not configured.")

    serialized_days: list[dict[str, object]] = []
    for day in days:
        date_key = str(day.get("date_key") or "").strip()
        raw_items = day.get("items")
        if not date_key or not isinstance(raw_items, list):
            continue

        messages: list[dict[str, str]] = []
        for raw_item in raw_items[:20]:
            if not isinstance(raw_item, dict):
                continue

            content = re.sub(r"\s+", " ", str(raw_item.get("content") or "")).strip()
            role = str(raw_item.get("role") or "").strip()
            mode = str(raw_item.get("mode") or "").strip()
            if role not in {"user", "assistant"} or not content:
                continue

            messages.append(
                {
                    "role": "부모님" if role == "user" else "CareMate",
                    "mode": mode or "basic",
                    "content": content[:180],
                }
            )

        if not messages:
            continue

        serialized_days.append(
            {
                "date_key": date_key,
                "message_count": len(messages),
                "messages": messages,
            }
        )

    if not serialized_days:
        return {}

    model = settings.llm_model or DEFAULT_OPENAI_MODEL
    payload = {
        "model": model,
        "input": [
            {
                "role": "developer",
                "content": (
                    "당신은 보호자용 대화 요약 도우미입니다.\n"
                    "항상 한국어로만 답합니다.\n"
                    "부모님과 CareMate의 대화를 날짜별로 짧고 사실적으로 요약합니다.\n"
                    "추측, 과장, 진단, 감정 확대 해석을 하지 않습니다.\n"
                    "각 날짜마다 headline은 8~16자 정도의 짧은 제목으로 작성합니다.\n"
                    "summary는 보호자에게 보고하듯 1문장 또는 2문장으로 작성합니다.\n"
                    "topics는 핵심 주제 1~3개만 간단한 명사구로 작성합니다.\n"
                    "증상 악화, 약 누락, 강한 혼란, 병원/응급 대응이 분명히 보일 때만 attention_needed를 true로 설정합니다.\n"
                    "attention_reason은 주의가 필요한 이유를 아주 짧게 적고, 아니면 빈 문자열로 둡니다.\n"
                    "반드시 아래 형식의 JSON 객체만 출력합니다.\n"
                    '{"summaries":[{"date_key":"2026-04-21","headline":"복약과 일정 확인","summary":"혈압약 복용 여부와 오늘 일정, 몸 상태를 주로 확인했어요.","topics":["복약","일정","건강 상태"],"attention_needed":false,"attention_reason":""}]}'
                ),
            },
            {
                "role": "user",
                "content": (
                    "다음 날짜별 대화 로그를 요약해 주세요.\n"
                    "날짜별로 정확히 1개씩 summary를 반환해야 합니다.\n"
                    "입력에 없는 사실은 추가하지 마세요.\n"
                    f"{json.dumps(serialized_days, ensure_ascii=False)}"
                ),
            },
        ],
    }

    _apply_reasoning_settings(payload, model)

    body = _post_responses_api(payload, failure_prefix="OpenAI guardian summary request failed")
    output_text = _extract_output_text(body)
    if not output_text:
        raise OpenAIServiceError("OpenAI guardian summary response did not include output text.")

    result = _extract_json_object(output_text)
    raw_summaries = result.get("summaries")
    if not isinstance(raw_summaries, list):
        raise OpenAIServiceError("OpenAI guardian summary response was missing summaries.")

    normalized: dict[str, dict[str, object]] = {}
    for raw_summary in raw_summaries:
        if not isinstance(raw_summary, dict):
            continue

        date_key = str(raw_summary.get("date_key") or "").strip()
        if not date_key:
            continue

        topics = raw_summary.get("topics")
        normalized_topics = []
        if isinstance(topics, list):
            normalized_topics = [
                str(topic).strip()
                for topic in topics
                if str(topic).strip()
            ][:3]

        attention_needed = bool(raw_summary.get("attention_needed"))
        attention_reason = str(raw_summary.get("attention_reason") or "").strip()

        normalized[date_key] = {
            "headline": str(raw_summary.get("headline") or "대화 요약").strip() or "대화 요약",
            "summary": str(raw_summary.get("summary") or "").strip(),
            "topics": normalized_topics,
            "attention_needed": attention_needed,
            "attention_reason": attention_reason if attention_needed else "",
        }

    if not normalized:
        raise OpenAIServiceError("OpenAI guardian summary response was empty.")

    return normalized


def _build_developer_prompt(
    intent: ChatIntent,
    mode: CareMode,
    requester_role: RequesterRole,
    grounded_hint: str | None,
    elder_profile_context: str | None = None,
) -> str:
    mode_instruction = {
        "basic": "짧고 자연스럽게 답변합니다.",
        "cognitive_support": "더 짧고 쉬운 문장으로 한 번에 한 가지 정보만 답변합니다.",
        "health_support": "건강, 일정, 복약 맥락을 우선하고 필요한 확인을 부드럽게 제안합니다.",
    }[mode]

    subject_instruction = (
        "당신은 부모님을 돌보는 보호자를 돕는 CareMate AI입니다."
        if requester_role == "guardian"
        else "당신은 고령 사용자를 돕는 CareMate AI입니다."
    )

    base_rules = [
        subject_instruction,
        "항상 한국어로 답변합니다.",
        "문장은 짧고 쉬워야 합니다.",
        "의료 진단이나 응급 판정은 하지 않습니다.",
        "확실하지 않으면 단정하지 말고 짧게 안내합니다.",
        "사용자 프로필 정보는 참고용으로만 사용합니다.",
        "사용자가 직접 묻지 않은 개인정보를 매 답변마다 반복해서 드러내지 않습니다.",
        "증상, 약, 건강 상태, 병원 관련 질문에서는 프로필 정보를 우선 참고합니다.",
        mode_instruction,
    ]

    if requester_role == "guardian":
        base_rules.extend(
            [
                "보호자 질문에는 부모님 기준 정보로 답변합니다.",
                "주어는 '부모님은' 또는 '어르신은'처럼 3인칭으로 자연스럽게 씁니다.",
                "보호자에게 보고하듯 간결하게 설명하고, 부모님에게 직접 말하듯 지시하지 않습니다.",
            ]
        )

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
    elif intent in {"schedule_lookup", "medication_lookup", "location_lookup", "health_status_lookup"} and grounded_hint:
        base_rules.extend(
            [
                "아래 조회 사실을 바탕으로만 자연스럽게 답변합니다.",
                "답변의 날짜, 시각, 숫자, 상태는 조회 사실과 정확히 일치해야 합니다.",
                "조회 사실에 없는 내용은 추측해서 덧붙이지 않습니다.",
                "답변은 보고하듯 자연스럽게 풀어쓰되 내부 필드명은 그대로 읽지 않습니다.",
                f"조회 사실:\n{grounded_hint}",
            ]
        )

    return "\n".join(base_rules)


def _build_classifier_prompt(
    mode: CareMode,
    requester_role: RequesterRole,
    elder_profile_context: str | None = None,
) -> str:
    actions: tuple[AgentAction, ...] = (
        "lookup_schedule",
        "lookup_medication",
        "lookup_location",
        "lookup_health_status",
        "check_mode",
        "create_schedule",
        "create_medication",
        "send_guardian_message",
        "mark_medication_taken",
        "request_location_refresh",
        "change_mode",
        "hospital_visit_support",
        "nearby_hospital_request",
        "symptom_support",
        "web_search_request",
        "small_talk",
        "general_support",
        "needs_clarification",
    )
    rules = [
        "당신은 CareMate 라우팅 분류기입니다.",
        "반드시 JSON 객체만 출력합니다. 설명 문장, 코드펜스, 주석을 절대 출력하지 않습니다.",
        f"현재 모드: {mode}",
        f"현재 사용자 역할: {requester_role}",
        "최근 대화가 주어지면 마지막 user 요청을 그 문맥 안에서 해석합니다.",
        "짧은 후속 질문이나 대명사 표현도 최근 대화 기준으로 해석합니다.",
        "가장 잘 맞는 action 하나만 선택합니다.",
        f"허용 action: {', '.join(actions)}",
        "slot_hints에는 추정이 아니라 텍스트나 최근 문맥에서 grounded 된 값만 넣습니다.",
        "모르는 값은 null 또는 생략합니다.",
        "slot_hints는 후속 실행에 직접 쓰일 수 있으므로 가능한 한 구체적으로 채웁니다.",
        "출력 형식:",
        '{"action":"lookup_schedule","slot_hints":{"date_range":"오늘","time_scope":null,"date":null,"time":null,"title":null,"target":null,"content":null,"medication_name":null,"status":null,"target_mode":null}}',
        "slot 규칙:",
        "- date_range: 오늘, 내일, 모레, 이번 주, 월요일~일요일, YYYY-MM-DD 중 하나",
        "- date: 일정 생성 시 실제 일정 날짜를 채웁니다. date_range와 같으면 둘 다 넣어도 됩니다.",
        "- time: 일정 생성 시 '오전 11시 30분', '오후 2시', '14:30'처럼 구체적으로 넣습니다.",
        "- title: create_schedule일 때는 가능한 한 구체적인 일정명을 넣습니다. 단순히 '일정'보다 '아들 약속', '병원 진료', '주민센터 방문'처럼 씁니다.",
        "- target: 보호자, 아들, 딸 등 메시지/약속 대상이 명확하면 넣습니다.",
        "- content: send_guardian_message일 때 전달할 말을 핵심만 보존해서 넣습니다.",
        "- medication_name: mark_medication_taken 또는 create_medication일 때 약 이름이 보이면 넣습니다.",
        "- time_scope: 지금, 오늘, 아침, 점심, 저녁, 오늘 아침, 오늘 저녁 중 하나",
        "- create_medication은 새 복약 스케줄을 등록하는 요청입니다. time에는 복용 시각을 넣습니다.",
        "- lookup_location은 보호자가 부모님 최신 위치를 조회하려는 요청입니다.",
        "- request_location_refresh는 보호자가 부모님 기기에 현재 위치 갱신 요청을 보내려는 요청입니다.",
        "- target_mode: basic, cognitive_support, health_support 중 하나",
        "- status: taken 또는 missed",
        "- message/confirmation의 짧은 대답으로 의미가 불명확하면 needs_clarification 또는 general_support를 고릅니다.",
        "예시 1:",
        '{"action":"create_schedule","slot_hints":{"date_range":"목요일","date":"목요일","time":"오후 2시","title":"아들 약속","target":"아들"}}',
        "예시 2:",
        '{"action":"create_schedule","slot_hints":{"date_range":"목요일","date":"목요일","time":"오후 2시"}}',
        "위 예시 2는 최근 대화에서 이미 일정 추가를 논의했고, 사용자가 후속으로 '목요일 오후 두시'라고만 말한 경우입니다.",
        "예시 3:",
        '{"action":"send_guardian_message","slot_hints":{"target":"보호자","content":"오늘은 조금 늦게 들어갈게요"}}',
        "예시 4:",
        '{"action":"mark_medication_taken","slot_hints":{"medication_name":"혈압약","time_scope":"아침","status":"taken"}}',
        "예시 5:",
        '{"action":"create_medication","slot_hints":{"medication_name":"혈압약","time":"오후 8시"}}',
        "예시 6:",
        '{"action":"lookup_location","slot_hints":{}}',
        "예시 7:",
        '{"action":"request_location_refresh","slot_hints":{}}',
    ]

    if elder_profile_context:
        rules.extend(["", "[어르신 프로필 참고]", elder_profile_context])

    return "\n".join(rules)


def _build_web_search_prompt(mode: CareMode) -> str:
    mode_instruction = {
        "basic": "답변은 2문장 또는 3문장으로 짧게 요약합니다.",
        "cognitive_support": "더 짧고 쉬운 단어로 2문장 이내로 답합니다.",
        "health_support": "건강 관련 검색은 의료 진단처럼 말하지 말고 2문장 또는 3문장으로 보수적으로 답합니다.",
    }[mode]

    return "\n".join(
        [
            "당신은 CareMate 웹 검색 도우미입니다.",
            "항상 한국어로만 답합니다.",
            "최신 웹 정보를 바탕으로 사용자의 질문에 바로 답합니다.",
            "첫 문장에는 결론이나 핵심 정보만 짧게 말합니다.",
            "둘째 문장에는 근거 또는 다음 확인 포인트를 짧게 덧붙입니다.",
            "확실하지 않으면 단정하지 말고 확인이 어렵다고 분명히 말합니다.",
            "출처 링크는 응답 본문에 길게 나열하지 않습니다.",
            mode_instruction,
        ]
    )


def _post_responses_api(payload: dict, failure_prefix: str) -> dict:
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
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise OpenAIServiceError(f"{failure_prefix} with status {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise OpenAIServiceError(f"{failure_prefix}: {exc.reason}") from exc


def _apply_reasoning_settings(payload: dict, model: str) -> None:
    if model.startswith(("gpt-5", "o3", "o4")):
        payload["reasoning"] = {"effort": settings.llm_reasoning_effort}


def _normalize_recent_messages(recent_messages: list[dict[str, str]] | None) -> list[dict[str, str]]:
    normalized_messages: list[dict[str, str]] = []
    if not recent_messages:
        return normalized_messages

    for message in recent_messages:
        role = str(message.get("role") or "").strip()
        content = str(message.get("content") or "").strip()
        if role not in {"user", "assistant"} or not content:
            continue
        normalized_messages.append({"role": role, "content": content})

    return normalized_messages


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


def generate_health_explanation(
    metric: str,
    items: list[dict],
    elder_name: str,
) -> str:
    if not settings.openai_api_key:
        return "AI 설명 서비스를 사용할 수 없습니다."

    metric_meta = {
        "depression": {
            "name": "우울 지수",
            "desc": "대화에서 감지된 우울·불안·감정 저하·슬픔 관련 신호를 수치화한 지표",
        },
        "insomnia": {
            "name": "불면 지수",
            "desc": "대화에서 감지된 수면 문제·불면·수면의 질 저하 관련 신호를 수치화한 지표",
        },
        "cognitive": {
            "name": "인지기능 지수",
            "desc": "대화에서 감지된 기억력·집중력·언어 능력 등 인지기능 저하 신호를 수치화한 지표",
        },
    }

    info = metric_meta.get(metric, {"name": metric, "desc": "건강 지표"})

    valid_items = [i for i in items if i.get("value") is not None]
    if valid_items:
        avg = sum(i["value"] for i in valid_items) / len(valid_items)
        trend = ", ".join(
            f"{i.get('date', '')}: {i['value'] * 100:.0f}%"
            for i in valid_items[-7:]
        )
    else:
        avg = 0.0
        trend = "데이터 없음"

    system_prompt = (
        "당신은 노인 돌봄 AI 건강 분석 보조입니다. "
        "보호자에게 AI 건강 지표를 쉽고 친절하게 설명해주세요. "
        "0~1 범위(0%~100%) 점수는 높을수록 해당 문제의 신호가 강합니다. "
        "의학적 진단이 아님을 명확히 하고, 보호자가 실제로 취할 수 있는 행동을 제안해주세요. "
        "2~3 문단, 400자 이내로 간결하게 답변해주세요."
    )

    user_message = (
        f"{elder_name} 님의 '{info['name']}' 분석 결과입니다.\n\n"
        f"지표 의미: {info['desc']}\n"
        f"최근 평균: {avg * 100:.0f}%\n"
        f"최근 7일 추이: {trend}\n\n"
        "이 수치가 무엇을 의미하는지, 보호자가 어떻게 해석하고 대응해야 하는지 설명해주세요."
    )

    try:
        model = settings.llm_model or DEFAULT_OPENAI_MODEL
        payload = {
            "model": model,
            "input": [
                {"role": "developer", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        }
        body = _post_responses_api(payload, failure_prefix="Health explanation failed")
        return _extract_output_text(body) or "설명을 생성하지 못했어요."
    except OpenAIServiceError:
        return "AI 설명을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요."


def _extract_json_object(text: str) -> dict:
    normalized = text.strip()
    if normalized.startswith("```"):
        normalized = re.sub(r"^```(?:json)?\s*|\s*```$", "", normalized, flags=re.DOTALL).strip()

    try:
        result = json.loads(normalized)
        if isinstance(result, dict):
            return result
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", normalized, flags=re.DOTALL)
    if not match:
        raise OpenAIServiceError("OpenAI JSON output could not be parsed.")

    result = json.loads(match.group(0))
    if not isinstance(result, dict):
        raise OpenAIServiceError("OpenAI JSON output was not an object.")
    return result


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
