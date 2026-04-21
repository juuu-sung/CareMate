import re

from app.schemas.agent import AgentAction, AgentSlots
from app.schemas.chat import CareMode


TIME_PATTERN = re.compile(r"((오전|오후)\s*\d{1,2}시(?:\s*\d{1,2}분)?|\d{1,2}시(?:\s*\d{1,2}분)?)")
DATE_PATTERN = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
KOREAN_HOUR_WORDS = (
    "열두",
    "열한",
    "여덟",
    "일곱",
    "여섯",
    "다섯",
    "아홉",
    "세",
    "네",
    "두",
    "한",
    "열",
)
KOREAN_TIME_PATTERN = re.compile(
    rf"((오전|오후)\s*({'|'.join(KOREAN_HOUR_WORDS)})\s*시(?:\s*반|\s*\d{{1,2}}분)?|({'|'.join(KOREAN_HOUR_WORDS)})\s*시(?:\s*반|\s*\d{{1,2}}분)?)"
)
KOREAN_HOUR_MAP = {
    "한": "1",
    "두": "2",
    "세": "3",
    "네": "4",
    "다섯": "5",
    "여섯": "6",
    "일곱": "7",
    "여덟": "8",
    "아홉": "9",
    "열": "10",
    "열한": "11",
    "열두": "12",
}
WEEKDAY_LABELS = (
    "월요일",
    "화요일",
    "수요일",
    "목요일",
    "금요일",
    "토요일",
    "일요일",
)
DATE_SYNONYM_MAP = {
    "오늘": "오늘",
    "내일": "내일",
    "모레": "모레",
    "이번주": "이번 주",
    "이번 주": "이번 주",
}
TIME_SCOPE_SYNONYM_MAP = {
    "지금": "지금",
    "현재": "지금",
    "아침": "아침",
    "점심": "점심",
    "저녁": "저녁",
    "오늘": "오늘",
    "오늘아침": "오늘 아침",
    "오늘 아침": "오늘 아침",
    "오늘저녁": "오늘 저녁",
    "오늘 저녁": "오늘 저녁",
}


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
        "lookup_health_status": [],
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


def normalize_agent_slots(action: AgentAction, slots: AgentSlots) -> AgentSlots:
    normalized = slots.model_copy(deep=True)

    normalized.date_range = _normalize_date_value(normalized.date_range)
    normalized.date = _normalize_date_value(normalized.date or normalized.date_range)
    normalized.time = _normalize_time_value(normalized.time)
    normalized.time_scope = _normalize_time_scope_value(normalized.time_scope)
    normalized.target = _normalize_target_value(normalized.target)
    normalized.medication_name = _normalize_simple_text(normalized.medication_name)
    normalized.title = _normalize_schedule_title_value(normalized.title, normalized.target)
    normalized.content = _normalize_simple_text(normalized.content)

    if action == "lookup_schedule" and not normalized.date_range and normalized.date:
        normalized.date_range = normalized.date

    if action == "create_schedule":
        if not normalized.date and normalized.date_range:
            normalized.date = normalized.date_range
        if not normalized.title and normalized.target:
            normalized.title = f"{normalized.target} 약속"

    if action == "mark_medication_taken" and not normalized.status:
        normalized.status = "taken"

    return normalized


def _extract_date_range(text: str) -> str | None:
    if "오늘" in text:
        return "오늘"
    if "내일" in text:
        return "내일"
    if "모레" in text:
        return "모레"
    if "이번 주" in text or "이번주" in text:
        return "이번 주"

    explicit_date_match = DATE_PATTERN.search(text)
    if explicit_date_match:
        return explicit_date_match.group(0)

    for weekday in WEEKDAY_LABELS:
        if weekday in text:
            return weekday

    return None


def _extract_time(text: str) -> str | None:
    match = TIME_PATTERN.search(text)
    if match:
        return re.sub(r"\s+", " ", match.group(1)).strip()

    korean_match = KOREAN_TIME_PATTERN.search(text)
    if not korean_match:
        return None

    return _normalize_korean_time_expression(korean_match.group(1))


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
    sanitized = text.replace("약속", " ").replace("예약", " ").replace("계약", " ")
    if "혈압약" in text:
        return "혈압약"
    if "약" in sanitized:
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


def _normalize_korean_time_expression(value: str) -> str:
    normalized = re.sub(r"\s+", " ", value).strip()
    normalized = normalized.replace("시 반", "시 30분")
    normalized = normalized.replace("시반", "시 30분")

    for korean_hour in KOREAN_HOUR_WORDS:
        numeric_hour = KOREAN_HOUR_MAP[korean_hour]
        normalized = re.sub(
            rf"(?<!\d){korean_hour}(?=\s*시)",
            numeric_hour,
            normalized,
        )

    return normalized


def _normalize_date_value(value: str | None) -> str | None:
    normalized = _normalize_simple_text(value)
    if not normalized:
        return None

    if normalized in DATE_SYNONYM_MAP:
        return DATE_SYNONYM_MAP[normalized]

    for weekday in WEEKDAY_LABELS:
        if normalized == weekday or normalized == weekday.replace("요일", ""):
            return weekday

    explicit_date_match = DATE_PATTERN.search(normalized)
    if explicit_date_match:
        return explicit_date_match.group(0)

    return normalized


def _normalize_time_value(value: str | None) -> str | None:
    normalized = _normalize_simple_text(value)
    if not normalized:
        return None

    match = TIME_PATTERN.search(normalized)
    if match:
        return re.sub(r"\s+", " ", match.group(1)).strip()

    korean_match = KOREAN_TIME_PATTERN.search(normalized)
    if korean_match:
        return _normalize_korean_time_expression(korean_match.group(1))

    colon_match = re.search(r"\b(\d{1,2}):(\d{2})\b", normalized)
    if colon_match:
        hour = int(colon_match.group(1))
        minute = int(colon_match.group(2))
        return _format_hour_minute(hour, minute)

    hour_only_match = re.search(r"\b(\d{1,2})\s*시\b", normalized)
    if hour_only_match:
        hour = int(hour_only_match.group(1))
        return _format_hour_minute(hour, 0, preserve_24h="오전" not in normalized and "오후" not in normalized)

    return normalized


def _normalize_time_scope_value(value: str | None) -> str | None:
    normalized = _normalize_simple_text(value)
    if not normalized:
        return None

    compact = normalized.replace(" ", "")
    if compact in TIME_SCOPE_SYNONYM_MAP:
        return TIME_SCOPE_SYNONYM_MAP[compact]
    return TIME_SCOPE_SYNONYM_MAP.get(normalized, normalized)


def _normalize_target_value(value: str | None) -> str | None:
    normalized = _normalize_simple_text(value)
    if not normalized:
        return None

    lowered = normalized.lower()
    if lowered in {"guardian", "caregiver"}:
        return "보호자"
    if normalized in {"엄마", "어머니", "아버지", "아빠"}:
        return "보호자"
    if "아들" in normalized:
        return "아들"
    if "딸" in normalized:
        return "딸"
    if "보호자" in normalized:
        return "보호자"
    return normalized


def _normalize_schedule_title_value(title: str | None, target: str | None) -> str | None:
    normalized = _normalize_simple_text(title)
    if not normalized:
        return None

    generic_titles = {"일정", "약속"}
    if normalized in generic_titles and target:
        return f"{target} {normalized}"
    return normalized


def _normalize_simple_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"\s+", " ", str(value)).strip().strip("'\"")
    return normalized or None


def _format_hour_minute(hour: int, minute: int, preserve_24h: bool = False) -> str:
    if preserve_24h:
        if minute:
            return f"{hour}시 {minute}분"
        return f"{hour}시"

    meridiem = "오전"
    display_hour = hour
    if hour == 0:
        display_hour = 12
    elif hour == 12:
        meridiem = "오후"
    elif hour > 12:
        meridiem = "오후"
        display_hour = hour - 12

    if minute:
        return f"{meridiem} {display_hour}시 {minute}분"
    return f"{meridiem} {display_hour}시"
