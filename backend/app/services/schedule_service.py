from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import uuid4
import re

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.agent import AgentSlots
from app.schemas.chat import CareMode


WEEKDAY_MAP = {
    "월": 0,
    "화": 1,
    "수": 2,
    "목": 3,
    "금": 4,
    "토": 5,
    "일": 6,
}

STOPWORDS = {
    "좀",
    "조금",
    "해주세요",
    "해줘",
    "해주라",
    "부탁해",
    "부탁합니다",
    "해야지",
    "해야겠다",
    "할게",
    "할거야",
    "하자",
    "있어",
    "있습니다",
    "있거든",
    "잡아줘",
    "잡아주라",
    "넣어줘",
    "추가해줘",
    "등록해줘",
    "등록",
    "추가",
    "일정",
    "스케줄",
    "으로",
    "로",
    "에",
    "에서",
}

TIME_WORDS = {
    "오늘",
    "내일",
    "모레",
    "글피",
    "다음주",
    "이번주",
    "오전",
    "오후",
    "아침",
    "점심",
    "낮",
    "저녁",
    "밤",
    "새벽",
    "월요일",
    "화요일",
    "수요일",
    "목요일",
    "금요일",
    "토요일",
    "일요일",
}

TITLE_PRIORITY_KEYWORDS = [
    "가족 여행",
    "여행",
    "병원",
    "치과",
    "내과",
    "외과",
    "정형외과",
    "안과",
    "이비인후과",
    "피부과",
    "약국",
    "약",
    "복약",
    "주사",
    "검진",
    "진료",
    "예약",
    "산책",
    "운동",
    "재활",
    "물리치료",
    "점심",
    "저녁",
    "아침",
    "식사",
    "목욕",
    "미용실",
    "장보기",
    "마트",
    "시장",
    "은행",
    "약속",
    "방문",
    "면회",
]


@dataclass
class ParsedScheduleIntent:
    raw_text: str
    date: str | None
    time: str | None
    title: str
    description: str
    missing_slots: list[str]


def _now() -> datetime:
    return datetime.now()


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _safe_datetime(year: int, month: int, day: int) -> datetime | None:
    try:
        return datetime(year, month, day)
    except ValueError:
        return None


def _get_raw_text_from_slots(slots: AgentSlots) -> str:
    candidates = [
        getattr(slots, "raw_text", None),
        getattr(slots, "original_text", None),
        getattr(slots, "user_text", None),
        getattr(slots, "content", None),
        getattr(slots, "description", None),
        getattr(slots, "title", None),
    ]
    for candidate in candidates:
        if candidate and str(candidate).strip():
            return _normalize_whitespace(str(candidate))
    return ""


def _infer_year_for_month_day(month: int, day: int, now: datetime) -> int:
    candidate_this_year = _safe_datetime(now.year, month, day)
    if candidate_this_year is None:
        raise ValueError(f"잘못된 날짜입니다: {month}월 {day}일")
    if candidate_this_year.date() >= now.date():
        return now.year
    return now.year + 1


def _parse_explicit_year_month_day(text: str) -> str | None:
    patterns = [
        r"(?<!\d)(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?!\d)",
        r"(?<!\d)(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일(?!\d)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        year = int(match.group(1))
        month = int(match.group(2))
        day = int(match.group(3))
        candidate = _safe_datetime(year, month, day)
        if candidate:
            return candidate.date().isoformat()
    return None


def _parse_explicit_month_day(text: str, now: datetime) -> str | None:
    patterns = [
        r"(?<!\d)(\d{1,2})월\s*(\d{1,2})일(?!\d)",
        r"(?<!\d)(\d{1,2})/(\d{1,2})(?!\d)",
        r"(?<!\d)(\d{1,2})-(\d{1,2})(?!\d)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        month = int(match.group(1))
        day = int(match.group(2))
        year = _infer_year_for_month_day(month, day, now)
        candidate = _safe_datetime(year, month, day)
        if candidate:
            return candidate.date().isoformat()
    return None


def _parse_relative_day(text: str, now: datetime) -> str | None:
    today = now.date()
    mapping = {
        "오늘": 0,
        "내일": 1,
        "모레": 2,
        "글피": 3,
    }
    for word, offset in mapping.items():
        if word in text:
            return (today + timedelta(days=offset)).isoformat()
    return None


def _parse_weekday(text: str, now: datetime) -> str | None:
    today = now.date()

    match = re.search(r"다음주\s*([월화수목금토일])요일", text)
    if match:
        target_weekday = WEEKDAY_MAP[match.group(1)]
        days_until_next_monday = (7 - today.weekday()) % 7
        if days_until_next_monday == 0:
            days_until_next_monday = 7
        next_monday = today + timedelta(days=days_until_next_monday)
        target = next_monday + timedelta(days=target_weekday)
        return target.isoformat()

    match = re.search(r"이번주\s*([월화수목금토일])요일", text)
    if match:
        target_weekday = WEEKDAY_MAP[match.group(1)]
        monday = today - timedelta(days=today.weekday())
        target = monday + timedelta(days=target_weekday)
        return target.isoformat()

    if "다음주" in text:
        days_until_next_monday = (7 - today.weekday()) % 7
        if days_until_next_monday == 0:
            days_until_next_monday = 7
        return (today + timedelta(days=days_until_next_monday)).isoformat()

    match = re.search(r"(?<!이번주\s)(?<!다음주\s)([월화수목금토일])요일", text)
    if match:
        target_weekday = WEEKDAY_MAP[match.group(1)]
        days_ahead = (target_weekday - today.weekday()) % 7
        if days_ahead == 0:
            days_ahead = 7
        return (today + timedelta(days=days_ahead)).isoformat()

    return None


def extract_date_from_text(text: str, now: datetime | None = None) -> str | None:
    now = now or _now()
    text = _normalize_whitespace(text)

    for parser in (
        _parse_explicit_year_month_day,
        lambda t: _parse_explicit_month_day(t, now),
        lambda t: _parse_relative_day(t, now),
        lambda t: _parse_weekday(t, now),
    ):
        result = parser(text)
        if result:
            return result
    return None


def _convert_meridiem_hour(meridiem: str | None, hour: int) -> int:
    if meridiem == "오전":
        return 0 if hour == 12 else hour
    if meridiem == "오후":
        return 12 if hour == 12 else hour + 12
    return hour


def _format_time(hour: int, minute: int = 0, second: int = 0) -> str:
    return f"{hour:02d}:{minute:02d}:{second:02d}"


def _is_broad_time_expression(text: str) -> bool:
    return text in {"새벽", "아침", "점심", "낮", "저녁", "밤", "오전", "오후"}


def extract_time_from_text(text: str) -> str | None:
    text = _normalize_whitespace(text)

    match = re.search(r"(오전|오후)\s*(\d{1,2})시\s*(\d{1,2})분", text)
    if match:
        hour = _convert_meridiem_hour(match.group(1), int(match.group(2)))
        minute = int(match.group(3))
        return _format_time(hour, minute)

    match = re.search(r"(오전|오후)\s*(\d{1,2})시\s*반", text)
    if match:
        hour = _convert_meridiem_hour(match.group(1), int(match.group(2)))
        return _format_time(hour, 30)

    match = re.search(r"(오전|오후)\s*(\d{1,2})시", text)
    if match:
        hour = _convert_meridiem_hour(match.group(1), int(match.group(2)))
        return _format_time(hour)

    match = re.search(r"(?<!\d)(\d{1,2}):(\d{2})(?::(\d{2}))?(?!\d)", text)
    if match:
        hour = int(match.group(1))
        minute = int(match.group(2))
        second = int(match.group(3)) if match.group(3) else 0
        if 0 <= hour <= 23 and 0 <= minute <= 59 and 0 <= second <= 59:
            return _format_time(hour, minute, second)

    match = re.search(r"(?<!오전\s)(?<!오후\s)(\d{1,2})시\s*(\d{1,2})분", text)
    if match:
        hour = int(match.group(1))
        minute = int(match.group(2))
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return _format_time(hour, minute)

    match = re.search(r"(?<!오전\s)(?<!오후\s)(\d{1,2})시\s*반", text)
    if match:
        hour = int(match.group(1))
        if 0 <= hour <= 23:
            return _format_time(hour, 30)

    match = re.search(r"(?<!오전\s)(?<!오후\s)(\d{1,2})시", text)
    if match:
        hour = int(match.group(1))
        if 0 <= hour <= 23:
            return _format_time(hour)

    for broad in ("새벽", "아침", "점심", "낮", "저녁", "밤", "오전", "오후"):
        if broad in text:
            return broad

    return None


def _normalize_korean_date(date_str: str | None) -> str | None:
    if not date_str:
        return None
    raw = _normalize_whitespace(date_str)
    if not raw:
        return None

    parsed = extract_date_from_text(raw)
    if parsed:
        return parsed

    try:
        dt = datetime.fromisoformat(raw)
        return dt.date().isoformat()
    except ValueError:
        pass

    try:
        dt = datetime.fromisoformat(raw.replace(" ", "T"))
        return dt.date().isoformat()
    except ValueError:
        pass

    raise ValueError(f"해석할 수 없는 날짜 형식입니다: {raw}")


def _normalize_korean_time(time_str: str | None) -> str | None:
    if not time_str:
        return None

    raw = _normalize_whitespace(time_str)
    if not raw:
        return None

    parsed = extract_time_from_text(raw)
    if not parsed:
        return None

    if _is_broad_time_expression(parsed):
        return None

    return parsed


def _combine_datetime(date_str: str | None, time_str: str | None) -> datetime:
    normalized_date = _normalize_korean_date(date_str)
    if not normalized_date:
        raise ValueError("date가 필요합니다.")

    normalized_time = _normalize_korean_time(time_str)
    if not normalized_time:
        raise ValueError("정확한 time이 필요합니다.")

    try:
        return datetime.fromisoformat(f"{normalized_date}T{normalized_time}")
    except ValueError as exc:
        raise ValueError(
            "date/time 형식이 올바르지 않습니다. 예: 2026-04-21, 14:30 또는 내일, 오후 3시"
        ) from exc


def _remove_date_time_expressions(text: str) -> str:
    text = re.sub(r"\d{4}[./-]\d{1,2}[./-]\d{1,2}", " ", text)
    text = re.sub(r"\d{4}년\s*\d{1,2}월\s*\d{1,2}일", " ", text)
    text = re.sub(r"\d{1,2}월\s*\d{1,2}일", " ", text)
    text = re.sub(r"\d{1,2}/\d{1,2}", " ", text)
    text = re.sub(r"\d{1,2}-\d{1,2}", " ", text)
    text = re.sub(r"(오늘|내일|모레|글피|다음주|이번주)", " ", text)
    text = re.sub(r"([월화수목금토일])요일", " ", text)
    text = re.sub(r"(오전|오후)\s*\d{1,2}시\s*\d{1,2}분", " ", text)
    text = re.sub(r"(오전|오후)\s*\d{1,2}시\s*반", " ", text)
    text = re.sub(r"(오전|오후)\s*\d{1,2}시", " ", text)
    text = re.sub(r"\d{1,2}:\d{2}(?::\d{2})?", " ", text)
    text = re.sub(r"\d{1,2}시\s*\d{1,2}분", " ", text)
    text = re.sub(r"\d{1,2}시\s*반", " ", text)
    text = re.sub(r"\d{1,2}시", " ", text)
    text = re.sub(r"(새벽|아침|점심|낮|저녁|밤|오전|오후)", " ", text)
    return _normalize_whitespace(text)


def _clean_title_source_text(text: str) -> str:
    text = _remove_date_time_expressions(text)
    removable_phrases = [
        "일정 잡아줘",
        "일정 잡아주라",
        "일정 등록해줘",
        "일정 추가해줘",
        "스케줄 잡아줘",
        "스케줄 등록해줘",
        "스케줄 추가해줘",
        "일정으로 잡아줘",
        "일정으로 잡아주라",
        "등록해줘",
        "추가해줘",
        "잡아줘",
        "잡아주라",
        "넣어줘",
        "해줘",
        "해주세요",
        "부탁해",
        "부탁합니다",
    ]
    for phrase in removable_phrases:
        text = text.replace(phrase, " ")
    return _normalize_whitespace(text)


def _extract_tokens(text: str) -> list[str]:
    tokens = re.findall(r"[가-힣A-Za-z0-9]+", text)
    results = []
    for token in tokens:
        if token in STOPWORDS or token in TIME_WORDS:
            continue
        if len(token) == 1 and token not in {"약", "밥"}:
            continue
        results.append(token)
    return results


def _pattern_based_title(text: str) -> str | None:
    patterns = [
        (r"가족\s*여행", "가족 여행"),
        (r"\b여행\b", "여행"),
        (r"정형외과", "정형외과"),
        (r"이비인후과", "이비인후과"),
        (r"피부과", "피부과"),
        (r"안과", "안과"),
        (r"치과", "치과"),
        (r"내과", "내과"),
        (r"외과", "외과"),
        (r"병원", "병원"),
        (r"약국", "약국"),
        (r"약.*먹", "약 먹기"),
        (r"복약", "약 먹기"),
        (r"검진", "검진"),
        (r"진료", "진료"),
        (r"예약", "예약"),
        (r"산책", "산책"),
        (r"운동", "운동"),
        (r"재활", "재활"),
        (r"물리치료", "물리치료"),
        (r"점심\s*약속", "점심 약속"),
        (r"저녁\s*약속", "저녁 약속"),
        (r"아침\s*약속", "아침 약속"),
        (r"점심", "점심"),
        (r"저녁", "저녁"),
        (r"아침", "아침"),
        (r"식사", "식사"),
        (r"목욕", "목욕"),
        (r"미용실", "미용실"),
        (r"장보기", "장보기"),
        (r"마트", "마트"),
        (r"시장", "시장"),
        (r"은행", "은행"),
        (r"면회", "면회"),
        (r"방문", "방문"),
        (r"약속", "약속"),
    ]
    for pattern, label in patterns:
        if re.search(pattern, text):
            return label
    return None


def extract_title_from_text(raw_text: str) -> str:
    if not raw_text or not raw_text.strip():
        return "일정"

    cleaned = _clean_title_source_text(raw_text)

    pattern_title = _pattern_based_title(cleaned)
    if pattern_title:
        return pattern_title

    tokens = _extract_tokens(cleaned)
    if not tokens:
        return "일정"

    for keyword in TITLE_PRIORITY_KEYWORDS:
        if keyword in cleaned:
            return keyword[:20]

    title = " ".join(tokens[:3]).strip()
    return title[:20] if title else "일정"


def extract_description_from_text(raw_text: str) -> str:
    return _normalize_whitespace(raw_text) if raw_text else ""


def parse_schedule_intent_from_slots(slots: AgentSlots) -> ParsedScheduleIntent:
    raw_text = _get_raw_text_from_slots(slots)

    explicit_date = getattr(slots, "date", None)
    explicit_time = getattr(slots, "time", None)
    explicit_title = getattr(slots, "title", None)
    explicit_description = getattr(slots, "description", None) or getattr(slots, "content", None)

    parsed_date = _normalize_korean_date(explicit_date) if explicit_date else None
    if not parsed_date and raw_text:
        parsed_date = extract_date_from_text(raw_text)

    parsed_time = _normalize_korean_time(explicit_time) if explicit_time else None
    if not parsed_time and raw_text:
        parsed_time = _normalize_korean_time(extract_time_from_text(raw_text))

    if explicit_title and str(explicit_title).strip() and str(explicit_title).strip() not in {"일정", "스케줄", "약속"}:
        title = _normalize_whitespace(str(explicit_title))[:20]
    else:
        title = extract_title_from_text(raw_text)

    if explicit_description and str(explicit_description).strip():
        description = _normalize_whitespace(str(explicit_description))
    else:
        description = extract_description_from_text(raw_text)

    missing_slots = []
    if not parsed_date:
        missing_slots.append("date")
    if not parsed_time:
        missing_slots.append("time")

    return ParsedScheduleIntent(
        raw_text=raw_text,
        date=parsed_date,
        time=parsed_time,
        title=title,
        description=description,
        missing_slots=missing_slots,
    )


def create_schedule_from_slots(
    db: Session,
    slots: AgentSlots,
    mode: CareMode,
    elder_user_id: str | None = None,
) -> dict:
    if not elder_user_id:
        raise ValueError("elder_user_id가 없어 일정을 저장할 수 없습니다.")

    parsed = parse_schedule_intent_from_slots(slots)

    if parsed.missing_slots:
        missing_korean = []
        if "date" in parsed.missing_slots:
            missing_korean.append("날짜")
        if "time" in parsed.missing_slots:
            missing_korean.append("시간")
        raise ValueError(f"일정 저장에 필요한 정보가 부족합니다: {', '.join(missing_korean)}")

    scheduled_at = _combine_datetime(parsed.date, parsed.time)
    schedule_id = str(uuid4())
    schedule_type = "general"
    status = "scheduled"

    db.execute(
        text(
            """
            INSERT INTO schedules (
                id,
                senior_user_id,
                title,
                description,
                scheduled_at,
                type,
                status,
                created_at
            )
            VALUES (
                :id,
                :senior_user_id,
                :title,
                :description,
                :scheduled_at,
                :type,
                :status,
                NOW()
            )
            """
        ),
        {
            "id": schedule_id,
            "senior_user_id": elder_user_id,
            "title": parsed.title,
            "description": parsed.description,
            "scheduled_at": scheduled_at,
            "type": schedule_type,
            "status": status,
        },
    )
    db.commit()

    return {
        "id": schedule_id,
        "elder_user_id": elder_user_id,
        "senior_user_id": elder_user_id,
        "title": parsed.title,
        "description": parsed.description,
        "scheduled_at": scheduled_at.isoformat(),
        "date": scheduled_at.strftime("%Y-%m-%d"),
        "time": scheduled_at.strftime("%H:%M"),
        "type": schedule_type,
        "status": status,
        "raw_text": parsed.raw_text,
    }


def list_schedules(
    db: Session,
    senior_user_id: str | None = None,
) -> list[dict]:
    if senior_user_id:
        rows = db.execute(
            text(
                """
                SELECT
                    id,
                    senior_user_id,
                    title,
                    description,
                    scheduled_at,
                    type,
                    status,
                    created_at
                FROM schedules
                WHERE senior_user_id = :senior_user_id
                ORDER BY scheduled_at ASC
                """
            ),
            {"senior_user_id": senior_user_id},
        ).mappings().all()
    else:
        rows = db.execute(
            text(
                """
                SELECT
                    id,
                    senior_user_id,
                    title,
                    description,
                    scheduled_at,
                    type,
                    status,
                    created_at
                FROM schedules
                ORDER BY scheduled_at ASC
                """
            )
        ).mappings().all()

    items: list[dict] = []
    for row in rows:
        scheduled_at = row["scheduled_at"]
        items.append(
            {
                "id": row["id"],
                "elder_user_id": row["senior_user_id"],
                "senior_user_id": row["senior_user_id"],
                "title": row["title"],
                "description": row["description"] or "",
                "scheduled_at": scheduled_at.isoformat() if scheduled_at else "",
                "date": scheduled_at.strftime("%Y-%m-%d") if scheduled_at else "",
                "time": scheduled_at.strftime("%H:%M") if scheduled_at else "",
                "type": row["type"],
                "status": row["status"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            }
        )
    return items