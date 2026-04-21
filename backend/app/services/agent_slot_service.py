import re

from app.schemas.agent import AgentAction, AgentSlots
from app.schemas.chat import CareMode

TIME_PATTERN = re.compile(
    r"((오전|오후)\s*\d{1,2}시(?:\s*(?:반|\d{1,2}분))?|\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}시(?:\s*(?:반|\d{1,2}분))?)"
)
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
DATE_PATTERNS = [
    r"\d{4}년\s*\d{1,2}월\s*\d{1,2}일",
    r"\d{4}[./-]\d{1,2}[./-]\d{1,2}",
    r"\d{1,2}월\s*\d{1,2}일",
    r"\d{1,2}/\d{1,2}",
    r"\d{1,2}-\d{1,2}",
    r"다음\s*주\s*[월화수목금토일]요일",
    r"이번\s*주\s*[월화수목금토일]요일",
    r"[월화수목금토일]요일",
    r"오늘",
    r"내일",
    r"모레",
    r"글피",
    r"이번\s*주",
    r"다음\s*주",
]
DATE_PATTERN = re.compile("|".join(f"(?:{pattern})" for pattern in DATE_PATTERNS))
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
    "글피": "글피",
    "이번주": "이번 주",
    "이번 주": "이번 주",
    "다음주": "다음 주",
    "다음 주": "다음 주",
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
SCHEDULE_ENDINGS = [
    "가야 한다",
    "가야한다",
    "가야 해",
    "가야해",
    "가야 돼",
    "가야돼",
    "다녀와야 한다",
    "다녀와야한다",
    "다녀와야 해",
    "다녀와야해",
    "넣어줘",
    "추가해줘",
    "등록해줘",
    "잡아줘",
    "잡아주라",
    "기억해줘",
    "기록해줘",
    "적어줘",
    "넣어",
    "추가해",
    "등록해",
    "잡아",
    "잡아라",
    "넣어라",
    "등록해라",
    "추가해라",
    "만들어",
    "만들어줘",
    "만들어라",
    "해줘",
    "해라",
    "해",
]


def extract_agent_slots(action: AgentAction, text: str) -> AgentSlots:
    normalized = re.sub(r"\s+", " ", text.strip())
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
        slots.content = normalized
        slots.raw_text = normalized

    if action == "send_guardian_message":
        slots.content = _extract_message_content(normalized)

    if action == "mark_medication_taken":
        if any(keyword in lowered for keyword in ("안 먹", "못 먹", "누락", "놓쳤")):
            slots.status = "missed"
        elif any(keyword in lowered for keyword in ("먹었", "복용", "기록", "먹었어", "먹었어요")):
            slots.status = "taken"

    return slots


def find_missing_slots(action: AgentAction, slots: AgentSlots) -> list[str]:
    required_by_action: dict[AgentAction, list[str]] = {
        "lookup_schedule": ["date_range"],
        "lookup_medication": ["time_scope"],
        "lookup_health_status": [],
        "check_mode": [],
        "create_schedule": ["date", "time"],
        "send_guardian_message": ["target", "content"],
        "mark_medication_taken": ["medication_name", "time_scope", "status"],
        "change_mode": ["target_mode"],
        "hospital_visit_support": [],
        "nearby_hospital_request": [],
        "symptom_support": [],
        "small_talk": [],
        "general_support": [],
        "needs_clarification": [],
        "web_search_request": [],
    }

    missing: list[str] = []
    for field_name in required_by_action[action]:
        value = getattr(slots, field_name, None)
        if not value:
            missing.append(field_name)
            continue
        if action == "create_schedule" and field_name == "time" and _is_broad_time_expression(value):
            missing.append("time")
    return missing


def merge_agent_slots(base_slots: AgentSlots, new_slots: AgentSlots) -> AgentSlots:
    merged_data = base_slots.model_dump()
    for field_name, value in new_slots.model_dump().items():
        if value is not None and value != "":
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
    normalized.raw_text = _normalize_simple_text(normalized.raw_text)

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
    for pattern in DATE_PATTERNS:
        match = re.search(pattern, text)
        if match:
            return re.sub(r"\s+", " ", match.group(0)).strip()
    return None


def _extract_time(text: str) -> str | None:
    match = TIME_PATTERN.search(text)
    if match:
        return re.sub(r"\s+", " ", match.group(1)).strip()

    korean_match = KOREAN_TIME_PATTERN.search(text)
    if korean_match:
        return _normalize_korean_time_expression(korean_match.group(1))

    broad_match = re.search(r"(새벽|아침|점심|낮|저녁|밤|오전|오후)", text)
    if broad_match:
        return broad_match.group(1).strip()

    return None


def _extract_time_scope(text: str) -> str | None:
    priority_keywords = (
        "오늘 아침",
        "오늘 점심",
        "오늘 저녁",
        "오늘 밤",
        "지금",
        "아침",
        "점심",
        "저녁",
        "오늘",
    )
    for keyword in priority_keywords:
        if keyword in text:
            return keyword
    return None


def _extract_schedule_title(text: str) -> str | None:
    cleaned = text.strip()

    for pattern in DATE_PATTERNS:
        cleaned = re.sub(pattern, " ", cleaned)

    cleaned = re.sub(
        r"((오전|오후)\s*\d{1,2}시(?:\s*(?:반|\d{1,2}분))?|\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}시(?:\s*(?:반|\d{1,2}분))?)",
        " ",
        cleaned,
    )
    cleaned = re.sub(r"(오전|오후|아침|점심|낮|저녁|밤|새벽)", " ", cleaned)
    cleaned = re.sub(r"(에|에는|으로|쯤|때|날)\b", " ", cleaned)
    cleaned = re.sub(r"(좀|조금|하나|하나만|하나쯤)", " ", cleaned)

    for ending in SCHEDULE_ENDINGS:
        cleaned = cleaned.replace(ending, " ")

    cleaned = re.sub(
        r"(일정|스케줄|약속)\s*(추가|등록|저장|잡아|잡아라|잡아줘|잡아주라|만들어|만들어줘|넣어|넣어줘)?",
        " ",
        cleaned,
    )
    cleaned = re.sub(r"(해줘|해주세요|부탁해|부탁해요)", " ", cleaned)
    cleaned = re.sub(r"[\"'.,!?]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    if not cleaned:
        return "일정"

    cleaned = _normalize_schedule_title_phrase(cleaned)
    if len(cleaned) > 12:
        cleaned = _compress_title(cleaned)
    if len(cleaned) > 12:
        cleaned = cleaned[:12].strip()
    return cleaned or "일정"


def _normalize_schedule_title_phrase(text: str) -> str:
    replacements = [
        ("가족 여행 가", "가족 여행"),
        ("가족 여행", "가족 여행"),
        ("여행 가", "여행"),
        ("친구 병문안 가", "친구 병문안"),
        ("친구 병문안", "친구 병문안"),
        ("병문안 가", "병문안"),
        ("병문안", "병문안"),
        ("병원 가", "병원 방문"),
        ("병원 방문", "병원 방문"),
        ("진료 가", "병원 진료"),
        ("진료", "병원 진료"),
        ("약 타러 가", "약 수령"),
        ("약 받으러 가", "약 수령"),
        ("약 찾으러 가", "약 수령"),
        ("약국 가", "약국 방문"),
        ("주민센터 가", "주민센터"),
        ("마트 가", "마트 장보기"),
        ("장 보러 가", "장보기"),
        ("은행 가", "은행 방문"),
        ("식사 하", "식사"),
        ("밥 먹", "식사"),
        ("축구", "축구"),
        ("병원", "병원 방문"),
    ]
    result = text
    for source, target in replacements:
        if source in result:
            return target
    return result


def _compress_title(text: str) -> str:
    priority_keywords = [
        "가족 여행",
        "친구 병문안",
        "병원 진료",
        "병원 방문",
        "약 수령",
        "약국 방문",
        "주민센터",
        "마트 장보기",
        "장보기",
        "은행 방문",
        "식사",
        "약속",
        "여행",
    ]
    for keyword in priority_keywords:
        if keyword in text:
            return keyword

    words = text.split()
    if len(words) >= 2:
        spaced = " ".join(words[:2])
        if len(spaced) <= 12:
            return spaced
        combined = "".join(words[:2])
        if len(combined) <= 12:
            return combined

    return text


def _is_broad_time_expression(value: str) -> bool:
    return value in {"오전", "오후", "아침", "점심", "낮", "저녁", "밤", "새벽"}


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
        normalized = re.sub(
            rf"(?<!\d){korean_hour}(?=\s*시)",
            KOREAN_HOUR_MAP[korean_hour],
            normalized,
        )
    return normalized


def _normalize_date_value(value: str | None) -> str | None:
    normalized = _normalize_simple_text(value)
    if not normalized:
        return None

    compact = normalized.replace(" ", "")
    if compact in DATE_SYNONYM_MAP:
        return DATE_SYNONYM_MAP[compact]

    for weekday in WEEKDAY_LABELS:
        if normalized == weekday or normalized == weekday.replace("요일", ""):
            return weekday

    explicit_date_match = DATE_PATTERN.search(normalized)
    if explicit_date_match:
        return re.sub(r"\s+", " ", explicit_date_match.group(0)).strip()

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
        return _format_hour_minute(
            hour,
            0,
            preserve_24h="오전" not in normalized and "오후" not in normalized,
        )

    if _is_broad_time_expression(normalized):
        return normalized

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
        return f"{target} 약속"
    if target and target in normalized:
        return f"{target} 약속"
    if "친구" in normalized:
        return "친구 약속"
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
