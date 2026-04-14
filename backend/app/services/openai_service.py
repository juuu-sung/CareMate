import json
from urllib import error, request

from app.core.config import settings
from app.schemas.chat import CareMode, ChatIntent

OPENAI_API_URL = "https://api.openai.com/v1/responses"
DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"


class OpenAIServiceError(RuntimeError):
    pass


def generate_chat_text(intent: ChatIntent, user_text: str, mode: CareMode, grounded_hint: str | None = None) -> str:
    if not settings.openai_api_key:
        raise OpenAIServiceError("OPENAI_API_KEY is not configured.")

    model = settings.llm_model or DEFAULT_OPENAI_MODEL
    payload = {
        "model": model,
        "input": [
            {
                "role": "developer",
                "content": _build_developer_prompt(intent=intent, mode=mode, grounded_hint=grounded_hint),
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
        raise OpenAIServiceError(f"OpenAI request failed with status {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise OpenAIServiceError(f"OpenAI request failed: {exc.reason}") from exc

    output_text = _extract_output_text(body)
    if not output_text:
        raise OpenAIServiceError("OpenAI response did not include output text.")

    return output_text.strip()


def _build_developer_prompt(intent: ChatIntent, mode: CareMode, grounded_hint: str | None) -> str:
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
        mode_instruction,
    ]

    if intent == "small_talk":
        base_rules.append("정서적 공감 표현을 먼저 하고, 부담 없는 한 문장을 추가합니다.")
    elif intent == "general_support":
        base_rules.append("생활지원형 말투로만 답변하고 과도하게 길게 설명하지 않습니다.")
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
