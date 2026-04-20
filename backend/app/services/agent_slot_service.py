import re

from app.schemas.agent import AgentAction, AgentSlots
from app.schemas.chat import CareMode


EXACT_TIME_PATTERN = re.compile(
    r"((오전|오후)\s*\d{1,2}시(?:\s*(?:반|\d{1,2}분))?|\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}시(?:\s*(?:반|\d{1,2}분))?)"
)

BROAD_TIME_PATTERN = re.compile(
    r"(새벽|아침|점심|낮|저녁|밤|오전|오후)"
)

DATE_PATTERNS = [
    r"\d{4}년\s*\d{1,2}월\s*\d{1,2}일",
    r"\d{4}[./-]\d{1,2}[./-]\d{1,2}",
    r"\d{1,2}월\s*\d{1,2}일",
    r"\d{1,2}/\d{1,2}",
    r"\d{1,2}-\d{1,2}",
    r"다음주\s*[월화수목금토일]요일",
    r"이번주\s*[월화수목금토일]요일",
    r"다음\s*주\s*[월화수목금토일]요일",
    r"이번\s*주\s*[월화수목금토일]요일",
    r"(월|화|수|목|금|토|일)요일",
    r"오늘",
    r"내일",
    r"모레",
    r"글피",
    r"이번\s*주",
    r"다음\s*주",
]

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
        if hasattr(slots, "raw_text"):
            slots.raw_text = normalized

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
    }

    missing: list[str] = []

    for field_name in required_by_action[action]:
        value = getattr(slots, field_name, None)

        if not value:
            missing.append(field_name)
            continue

        if action == "create_schedule" and field_name == "time":
            if _is_broad_time_expression(value):
                missing.append("time")

    return missing


def merge_agent_slots(base_slots: AgentSlots, new_slots: AgentSlots) -> AgentSlots:
    merged_data = base_slots.model_dump()

    for field_name, value in new_slots.model_dump().items():
        if value is not None and value != "":
            merged_data[field_name] = value

    return AgentSlots(**merged_data)


def _extract_date_range(text: str) -> str | None:
    patterns = [
        r"\d{4}년\s*\d{1,2}월\s*\d{1,2}일",
        r"\d{4}[./-]\d{1,2}[./-]\d{1,2}",
        r"\d{1,2}월\s*\d{1,2}일",
        r"\d{1,2}/\d{1,2}",
        r"\d{1,2}-\d{1,2}",
        r"다음주\s*[월화수목금토일]요일",
        r"이번주\s*[월화수목금토일]요일",
        r"다음 주\s*[월화수목금토일]요일",
        r"이번 주\s*[월화수목금토일]요일",
        r"(월|화|수|목|금|토|일)요일",
        r"오늘",
        r"내일",
        r"모레",
        r"글피",
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return re.sub(r"\s+", " ", match.group(0)).strip()

    return None


def _extract_time(text: str) -> str | None:
    exact_match = EXACT_TIME_PATTERN.search(text)
    if exact_match:
        return re.sub(r"\s+", " ", exact_match.group(1)).strip()

    broad_match = BROAD_TIME_PATTERN.search(text)
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
    for src, dst in replacements:
        if src in result:
            return dst

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