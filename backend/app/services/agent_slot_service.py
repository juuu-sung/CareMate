import re

from app.schemas.agent import AgentAction, AgentSlots
from app.schemas.chat import CareMode


TIME_PATTERN = re.compile(r"((오전|오후)\s*\d{1,2}시(?:\s*\d{1,2}분)?|\d{1,2}시(?:\s*\d{1,2}분)?)")


def extract_agent_slots(action: AgentAction, text: str) -> AgentSlots:
    normalized = text.strip()
    lowered = normalized.lower()
    slots = AgentSlots()

    slots.date_range = _extract_date_range(normalized)
    slots.date = slots.date_range
    slots.time = _extract_time(normalized)
    slots.time_scope = _extract_time_scope(normalized)
    slots.target = _extract_target(lowered)
    slots.medication_name = _extract_medication_name(normalized)
    slots.target_mode = _extract_target_mode(lowered)

    if action == "create_schedule":
        slots.title = _extract_schedule_title(normalized)
    if action == "send_guardian_message":
        slots.content = _extract_message_content(normalized)
    if action == "mark_medication_taken":
        slots.status = "taken" if any(keyword in lowered for keyword in ("먹었", "복용", "기록")) else None

    return slots


def find_missing_slots(action: AgentAction, slots: AgentSlots) -> list[str]:
    required_by_action: dict[AgentAction, list[str]] = {
        "lookup_schedule": ["date_range"],
        "lookup_medication": ["time_scope"],
        "check_mode": [],
        "create_schedule": ["title", "date", "time"],
        "send_guardian_message": ["target", "content"],
        "mark_medication_taken": ["medication_name", "time_scope", "status"],
        "change_mode": ["target_mode"],
        "hospital_visit_support": [],
        "nearby_hospital_request": [],
        "symptom_support": [],
        "small_talk": [],
        "general_support": [],
        "needs_clarification": [],
    }
    missing: list[str] = []
    for field_name in required_by_action[action]:
        if not getattr(slots, field_name):
            missing.append(field_name)
    return missing


def merge_agent_slots(base_slots: AgentSlots, new_slots: AgentSlots) -> AgentSlots:
    merged_data = base_slots.model_dump()
    for field_name, value in new_slots.model_dump().items():
        if value:
            merged_data[field_name] = value
    return AgentSlots(**merged_data)


def _extract_date_range(text: str) -> str | None:
    if "오늘" in text:
        return "오늘"
    if "내일" in text:
        return "내일"
    if "모레" in text:
        return "모레"
    if "이번 주" in text or "이번주" in text:
        return "이번 주"
    if "금요일" in text:
        return "금요일"
    if "토요일" in text:
        return "토요일"
    if "일요일" in text:
        return "일요일"
    if "월요일" in text:
        return "월요일"
    return None


def _extract_time(text: str) -> str | None:
    match = TIME_PATTERN.search(text)
    if not match:
        return None
    return re.sub(r"\s+", " ", match.group(1)).strip()


def _extract_time_scope(text: str) -> str | None:
    for keyword in ("지금", "아침", "점심", "저녁", "오늘", "오늘 저녁", "오늘 아침"):
        if keyword in text:
            return keyword
    return None


def _extract_schedule_title(text: str) -> str | None:
    if "병원" in text:
        return "병원 일정"
    if "주민센터" in text:
        return "주민센터 일정"
    if "약속" in text:
        return "약속"
    if "일정" in text:
        return "일정"
    return None


def _extract_target(text: str) -> str | None:
    if "보호자" in text:
        return "보호자"
    if "아들" in text:
        return "아들"
    if "딸" in text:
        return "딸"
    return None


def _extract_message_content(text: str) -> str | None:
    normalized = text
    for marker in ("한테", "에게"):
        if marker in normalized:
            after_marker = normalized.split(marker, 1)[1].strip()
            for suffix in ("보내줘", "전해줘", "보내", "전해"):
                if after_marker.endswith(suffix):
                    return after_marker[: -len(suffix)].strip(" '\"")
            return after_marker.strip(" '\"") or None
    return None


def _extract_medication_name(text: str) -> str | None:
    if "혈압약" in text:
        return "혈압약"
    if "약" in text:
        return "약"
    return None


def _extract_target_mode(text: str) -> CareMode | None:
    if "인지" in text:
        return "cognitive_support"
    if "건강" in text:
        return "health_support"
    if "기본" in text:
        return "basic"
    return None
