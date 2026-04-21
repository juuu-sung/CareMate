import re
from dataclasses import dataclass, field

from app.core.config import settings
from app.schemas.agent import AgentAction
from app.schemas.chat import CareMode, RequesterRole
from app.services.openai_service import OpenAIServiceError, classify_chat_action


@dataclass(frozen=True)
class IntentClassificationResult:
    action: AgentAction
    slot_hints: dict[str, str] = field(default_factory=dict)


def classify_agent_request(
    text: str,
    mode: CareMode,
    requester_role: RequesterRole = "parent",
    recent_messages: list[dict[str, str]] | None = None,
    elder_profile_context: str | None = None,
) -> IntentClassificationResult:
    if _should_use_llm_classifier():
        try:
            result = classify_chat_action(
                user_text=text,
                mode=mode,
                requester_role=requester_role,
                recent_messages=recent_messages,
                elder_profile_context=elder_profile_context,
            )
            action = _normalize_action(result.get("action"))
            slot_hints = _normalize_slot_hints(result.get("slot_hints"))
            return IntentClassificationResult(action=action, slot_hints=slot_hints)
        except (OpenAIServiceError, TypeError, ValueError):
            pass

    return IntentClassificationResult(
        action=_classify_agent_action_rule_based(text),
        slot_hints={},
    )


def _should_use_llm_classifier() -> bool:
    if settings.llm_provider == "openai":
        return bool(settings.openai_api_key)
    return settings.llm_provider == "stub" and bool(settings.openai_api_key)


def _normalize_action(value) -> AgentAction:
    allowed_actions: set[AgentAction] = {
        "lookup_schedule",
        "lookup_medication",
        "lookup_health_status",
        "check_mode",
        "create_schedule",
        "send_guardian_message",
        "mark_medication_taken",
        "change_mode",
        "hospital_visit_support",
        "nearby_hospital_request",
        "symptom_support",
        "web_search_request",
        "small_talk",
        "general_support",
        "needs_clarification",
    }

    normalized = str(value or "").strip()
    if normalized not in allowed_actions:
        raise ValueError("invalid action")
    return normalized


def _normalize_slot_hints(value) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}

    allowed_fields = {
        "date_range",
        "date",
        "time",
        "time_scope",
        "title",
        "target",
        "content",
        "medication_name",
        "status",
        "target_mode",
    }
    slot_hints: dict[str, str] = {}

    for field_name, raw_value in value.items():
        if field_name not in allowed_fields or raw_value in {None, ""}:
            continue

        normalized_value = str(raw_value).strip()
        if not normalized_value:
            continue

        if field_name == "date_range" and normalized_value == "이번주":
            normalized_value = "이번 주"
        if field_name == "target_mode" and normalized_value not in {
            "basic",
            "cognitive_support",
            "health_support",
        }:
            continue
        if field_name == "status" and normalized_value not in {"taken", "missed"}:
            continue

        slot_hints[field_name] = normalized_value

    return slot_hints


def _classify_agent_action_rule_based(text: str) -> AgentAction:
    normalized = text.strip().lower()

    if len(normalized) < 2:
        return "needs_clarification"

    if any(keyword in normalized for keyword in ("모드", "인지 지원", "건강 관리")):
        if any(keyword in normalized for keyword in ("바꿔", "변경", "전환", "해줘")):
            return "change_mode"
        return "check_mode"

    if any(keyword in normalized for keyword in ("편지", "보내", "전해", "메시지")):
        return "send_guardian_message"

    if any(keyword in normalized for keyword in ("기록", "체크")) and any(
        keyword in normalized for keyword in ("약", "복약", "먹었")
    ):
        return "mark_medication_taken"

    if _looks_like_nearby_hospital_request(normalized):
        return "nearby_hospital_request"

    if _looks_like_hospital_visit_request(normalized):
        return "hospital_visit_support"

    if _looks_like_symptom_support_request(normalized):
        return "symptom_support"

    if _looks_like_medication_request(normalized):
        return "lookup_medication"

    if _looks_like_health_status_request(normalized):
        return "lookup_health_status"

    if any(keyword in normalized for keyword in ("일정", "약속", "병원", "예약", "등록", "추가", "넣어")):
        if any(keyword in normalized for keyword in ("등록", "추가", "넣어", "잡아")):
            return "create_schedule"
        return "lookup_schedule"

    if _looks_like_web_search_request(normalized):
        return "web_search_request"

    if any(keyword in normalized for keyword in ("심심", "적적", "외롭", "말동무")):
        return "small_talk"

    return "general_support"


def _looks_like_nearby_hospital_request(text: str) -> bool:
    if "병원" not in text and "응급실" not in text:
        return False

    return any(keyword in text for keyword in ("주변", "근처", "가까운", "찾아", "알아봐", "있는지"))


def _looks_like_hospital_visit_request(text: str) -> bool:
    if "병원" not in text and "응급실" not in text:
        return False

    visit_keywords = (
        "가고 싶",
        "가고싶",
        "가야",
        "가자",
        "가려고",
        "데려다",
        "데려가",
        "응급실",
        "오늘 지금",
        "지금",
    )
    schedule_keywords = (
        "일정",
        "예약",
        "몇 시",
        "몇시",
        "오전",
        "오후",
        "내일 병원 일정",
        "오늘 병원 일정",
        "병원 일정",
        "등록",
        "추가",
        "넣어",
        "잡아",
    )

    if any(keyword in text for keyword in schedule_keywords):
        return False

    return any(keyword in text for keyword in visit_keywords)


def _looks_like_medication_request(text: str) -> bool:
    if any(keyword in text for keyword in ("약속", "예약", "계약")):
        sanitized = text
        for keyword in ("약속", "예약", "계약"):
            sanitized = sanitized.replace(keyword, " ")
        text = sanitized

    medication_patterns = (
        r"복약",
        r"약시간",
        r"혈압약",
        r"감기약",
        r"당뇨약",
        r"약 먹",
        r"드실 약",
        r"먹었",
        r"먹어",
        r"드셨어",
        r"(?<!예)약[은는이가을를도만]",
        r"(?<!예)약\s",
        r"\s약",
    )
    return any(re.search(pattern, text) for pattern in medication_patterns)


def _looks_like_symptom_support_request(text: str) -> bool:
    symptom_keywords = (
        "아파",
        "두통",
        "머리",
        "어지러",
        "속이",
        "메스껍",
        "토할",
        "배가",
        "가슴",
        "숨이",
        "기침",
        "열이",
        "몸살",
        "춥",
        "떨려",
    )
    return any(keyword in text for keyword in symptom_keywords)


def _looks_like_health_status_request(text: str) -> bool:
    if any(keyword in text for keyword in ("일정", "약속", "예약", "병원", "약", "복약")):
        return False

    direct_keywords = (
        "건강 상태",
        "상태 어때",
        "상태는 어때",
        "괜찮아",
        "괜찮으",
        "이상 징후",
        "알림 있",
        "체크인",
    )
    if any(keyword in text for keyword in direct_keywords):
        return True

    return "상태" in text and any(keyword in text for keyword in ("건강", "지금", "오늘", "부모님", "어르신"))


def _looks_like_web_search_request(text: str) -> bool:
    search_keywords = (
        "검색해",
        "검색해줘",
        "검색해 줄래",
        "알아봐",
        "알아봐줘",
        "찾아줘",
        "찾아봐",
        "찾아보",
    )
    return any(keyword in text for keyword in search_keywords)
