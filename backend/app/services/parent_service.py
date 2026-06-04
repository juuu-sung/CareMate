import json
import re
from datetime import datetime
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.models.user import User
from app.models.elder_profile import ElderProfile
from app.models.guardian_link import GuardianLink
from app.models.care_document import CareDocument

from app.rules.code_generator import generate_link_code
from app.schemas.parent import (
    ParentCareInfoUpdateRequest,
    ParentLoginRequest,
    ParentSignupRequest,
)
from app.services.file_upload import save_upload_file
from app.services.gpt_summary import summarize_medical_image

MEAL_TIMING_VALUES = {"식전", "식간", "식후"}
UNKNOWN_TEXT_VALUES = {"", "확인 불가", "미확인", "unknown", "none", "null"}
MEDICATION_TIME_LABELS = {
    "아침": "08:00",
    "점심": "13:00",
    "저녁": "19:00",
    "취침": "22:00",
}
DEFAULT_MEDICATION_TIMES = {
    1: ["08:00"],
    2: ["08:00", "20:00"],
    3: ["08:00", "13:00", "19:00"],
    4: ["08:00", "12:00", "18:00", "22:00"],
}


def calculate_age_from_birth(birth: str | None) -> int | None:
    if not birth:
        return None

    numbers = "".join(ch for ch in birth if ch.isdigit())
    if len(numbers) < 8:
        return None

    year = int(numbers[0:4])
    month = int(numbers[4:6])
    day = int(numbers[6:8])

    today = datetime.today().date()
    age = today.year - year - ((today.month, today.day) < (month, day))
    return age


def _generate_unique_link_code(db: Session) -> str:
    while True:
        code = generate_link_code()
        exists = db.query(GuardianLink).filter(GuardianLink.link_code == code).first()
        if not exists:
            return code


def _normalize_phone(value: str | None) -> str:
    if not value:
        return ""

    digits = "".join(ch for ch in value if ch.isdigit())
    return digits or value.strip()


def _normalize_birth(value: str | None) -> str:
    if not value:
        return ""

    return "".join(ch for ch in value if ch.isdigit())


def _find_parent_user(db: Session, payload: ParentLoginRequest) -> User | None:
    normalized_phone = _normalize_phone(payload.phone)
    normalized_birth = _normalize_birth(payload.birth)

    users = db.query(User).filter(User.role == "elder").all()

    for user in users:
        if (
            _normalize_phone(user.phone) == normalized_phone
            and _normalize_birth(user.birth) == normalized_birth
        ):
            return user

    return None


def create_parent(db: Session, payload: ParentSignupRequest):
    normalized_phone = _normalize_phone(payload.phone)
    existing_user = next(
        (
            user
            for user in db.query(User).all()
            if _normalize_phone(user.phone) == normalized_phone
        ),
        None,
    )
    if existing_user:
        raise ValueError("이미 가입된 전화번호입니다.")

    user_id = str(uuid4())

    new_user = User(
        id=user_id,
        phone=payload.phone,
        name=payload.name,
        birth=payload.birth,
        gender=payload.gender,
        role="elder",
    )

    db.add(new_user)
    db.flush()

    elder_profile = ElderProfile(
        id=str(uuid4()),
        user_id=user_id,
        address=payload.address or "",
        medications="",
        diseases="",
        allergies="",
        hospital="",
        doctor_contact="",
        memo="",
    )

    db.add(elder_profile)

    link_code = _generate_unique_link_code(db)

    guardian_link = GuardianLink(
        id=str(uuid4()),
        elder_user_id=user_id,
        guardian_user_id=None,
        link_code=link_code,
        is_used=False,
    )

    db.add(guardian_link)

    db.commit()
    db.refresh(new_user)

    return {
        "message": "부모님 회원가입이 완료되었습니다.",
        "parent_id": new_user.id,
        "parent_name": new_user.name,
        "link_code": link_code,
    }


def login_parent(db: Session, payload: ParentLoginRequest):
    parent_user = _find_parent_user(db, payload)

    if not parent_user:
        raise ValueError("전화번호 또는 생년월일이 올바르지 않습니다.")

    link = (
        db.query(GuardianLink)
        .filter(GuardianLink.elder_user_id == parent_user.id)
        .order_by(GuardianLink.created_at.desc())
        .first()
    )

    if not link:
        raise ValueError("연동 코드를 찾을 수 없습니다.")

    guardian_phone = ""

    if link.guardian_user_id:
        guardian_user = db.query(User).filter(User.id == link.guardian_user_id).first()
        if guardian_user and guardian_user.phone:
            guardian_phone = guardian_user.phone

    return {
        "message": "부모님 로그인이 완료되었습니다.",
        "parent_id": parent_user.id,
        "parent_name": parent_user.name,
        "link_code": link.link_code,
        "guardian_phone": guardian_phone,
    }


def get_parent_by_code(db: Session, link_code: str):
    link = db.query(GuardianLink).filter(GuardianLink.link_code == link_code).first()

    if not link:
        raise ValueError("유효하지 않은 연동 코드입니다.")

    elder_user = db.query(User).filter(User.id == link.elder_user_id).first()

    if not elder_user:
        raise ValueError("부모님 정보를 찾을 수 없습니다.")

    parent_age = calculate_age_from_birth(elder_user.birth)

    return {
        "parent_id": elder_user.id,
        "parent_name": elder_user.name,
        "parent_age": parent_age,
        "parent_gender": elder_user.gender or "",
        "link_code": link.link_code,
        "is_used": link.is_used,
    }


def update_parent_care_info(
    db: Session,
    parent_user_id: str,
    payload: ParentCareInfoUpdateRequest,
):
    elder_profile = (
        db.query(ElderProfile)
        .filter(ElderProfile.user_id == parent_user_id)
        .first()
    )

    if not elder_profile:
        raise ValueError("부모님 프로필을 찾을 수 없습니다.")

    elder_profile.address = payload.address or ""
    elder_profile.medications = payload.medications or ""
    elder_profile.diseases = payload.diseases or ""
    elder_profile.allergies = payload.allergies or ""
    elder_profile.hospital = payload.hospital or ""
    elder_profile.doctor_contact = payload.doctor_contact or ""
    elder_profile.memo = payload.memo or ""
    _sync_medication_schedule_rows(
        db,
        parent_user_id,
        _parse_plain_medication_text(payload.medications),
    )

    db.commit()
    db.refresh(elder_profile)

    return {
        "message": "부모님 돌봄 정보가 수정되었습니다.",
        "parent_user_id": parent_user_id,
        "care_info": {
            "address": elder_profile.address,
            "medications": elder_profile.medications,
            "diseases": elder_profile.diseases,
            "allergies": elder_profile.allergies,
            "hospital": elder_profile.hospital,
            "doctor_contact": elder_profile.doctor_contact,
            "memo": elder_profile.memo,
        },
    }


def _is_failed_document_summary(value: str | None) -> bool:
    raw = str(value or "").strip().lower()
    if not raw:
        return False

    failed_fragments = (
        "요약 실패",
        "invalid_request_error",
        "invalid_value",
        "the image data you provided",
        "지원하지 않는 문서 종류",
    )
    return any(fragment in raw for fragment in failed_fragments)


def _strip_failed_document_summary_fragments(value: str | None) -> str:
    raw = str(value or "")
    marker_patterns = (
        r",\s*\"?error\"?\s*:",
        r"\n\s*\"?error\"?\s*:",
        r"요약 실패\s*:",
        r"The image data you provided",
        r"invalid_request_error",
        r"invalid_value",
    )
    marker_indexes = [
        match.start()
        for pattern in marker_patterns
        for match in [re.search(pattern, raw, flags=re.IGNORECASE)]
        if match
    ]

    if not marker_indexes:
        return raw.strip()

    return raw[: min(marker_indexes)].rstrip(" ,\n\t")


def merge_summaries(base_text: str, title: str, summaries: list[str]) -> str:
    base_text = (base_text or "").strip()

    valid_summaries = [
        _strip_failed_document_summary_fragments(summary)
        for summary in summaries
        if summary
        and str(summary).strip()
        and not _is_failed_document_summary(summary)
        and _strip_failed_document_summary_fragments(summary)
    ]

    if not valid_summaries:
        return base_text

    summary_text = "\n\n".join(
        [
            f"[{title} 요약 {index + 1}]\n{summary}"
            for index, summary in enumerate(valid_summaries)
        ]
    )

    if base_text:
        return f"{base_text}\n\n{summary_text}"

    return summary_text


def _normalize_medication_name(value: str | None) -> str:
    name = _strip_failed_document_summary_fragments(value)
    name = re.sub(r"^[\-\*\d\.\)\s]+", "", name).strip()
    name = re.sub(r"\([^)]*\)", "", name).strip()
    name = re.sub(r"\[[^\]]*\]", "", name).strip()
    name = re.sub(r"\s+", " ", name).strip()

    invalid_fragments = [
        "확인 불가",
        "요약 실패",
        "이미지에서",
        "복약 안내",
        "언제 먹는지",
        "한 번에",
        "하루에",
        "쉬운 안내",
        "개인정보",
        "약이름",
        '"error"',
        '"message"',
        '"type"',
        '"param"',
        '"code"',
        "invalid_request_error",
        "invalid_value",
        "image data",
    ]

    name_lower = name.lower()
    if not name or any(fragment.lower() in name_lower for fragment in invalid_fragments):
        return ""

    return name[:120]


def _medication_match_key(name: str) -> str:
    return re.sub(r"\s+", "", name).lower()


def _normalize_easy_medication_name(value: str | None) -> str:
    name = _strip_failed_document_summary_fragments(value)
    name = re.sub(r"^[\-\*\d\.\)\s]+", "", name).strip()
    name = re.sub(r"\s+", " ", name).strip()

    invalid_fragments = [
        "확인 불가",
        "요약 실패",
        "이미지에서",
        "복약 안내",
        "언제 먹는지",
        "한 번에",
        "하루에",
        "개인정보",
        '"error"',
        '"message"',
        '"type"',
        '"param"',
        '"code"',
        "invalid_request_error",
        "invalid_value",
        "image data",
    ]

    name_lower = name.lower()
    if not name or any(fragment.lower() in name_lower for fragment in invalid_fragments):
        return ""

    return name[:80]


def _parse_easy_medication_map(summary: str) -> dict[str, str]:
    text_value = str(summary or "")
    section_match = re.search(
        r"\[쉬운 약 이름\]([\s\S]*?)(?=\n\s*\[|$)",
        text_value,
    )

    if not section_match:
        return {}

    result: dict[str, str] = {}
    for line in section_match.group(1).splitlines():
        if not line.strip().startswith("-"):
            continue

        body = line.lstrip("-").strip()
        if ":" not in body and "：" not in body:
            continue

        separator = ":" if ":" in body else "："
        raw_name, raw_easy_name = body.split(separator, 1)
        name = _normalize_medication_name(raw_name)
        easy_name = _normalize_easy_medication_name(raw_easy_name)

        if name and easy_name:
            result[name] = easy_name

    return result


def _medication_easy_name_for(
    medication_name: str,
    easy_name_map: dict[str, str],
) -> str:
    target_key = _medication_match_key(medication_name)
    if not target_key:
        return ""

    for raw_name, easy_name in easy_name_map.items():
        key = _medication_match_key(raw_name)
        if key and (key == target_key or key in target_key or target_key in key):
            return easy_name

    return ""


def _is_known_value(value: str | None) -> bool:
    raw = str(value or "").strip()
    if raw.lower() in UNKNOWN_TEXT_VALUES:
        return False
    return bool(raw) and "확인 불가" not in raw


def _coerce_positive_int(value, default: int | None = None) -> int | None:
    if value is None:
        return default

    match = re.search(r"\d+", str(value))
    if not match:
        return default

    parsed = int(match.group(0))
    if parsed <= 0:
        return default

    return parsed


def _normalize_meal_timing(value: str | None) -> str:
    raw = str(value or "").strip()
    for timing in MEAL_TIMING_VALUES:
        if timing in raw:
            return timing
    return ""


def _normalize_time(value: str | None) -> str:
    raw = str(value or "").strip()
    match = re.search(r"([01]?\d|2[0-3])\s*[:시]\s*([0-5]\d)?", raw)
    if not match:
        return ""

    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    return f"{hour:02d}:{minute:02d}"


def _normalize_times(value: str | None) -> list[str]:
    raw = str(value or "").strip()
    times = []

    for label, time_value in MEDICATION_TIME_LABELS.items():
        if label in raw and time_value not in times:
            times.append(time_value)

    for match in re.finditer(r"([01]?\d|2[0-3])\s*[:시]\s*([0-5]\d)?", raw):
        hour = int(match.group(1))
        minute = int(match.group(2) or 0)
        normalized = f"{hour:02d}:{minute:02d}"
        if normalized not in times:
            times.append(normalized)

    return times


def _medication_time_label_for(value: str | None) -> str:
    normalized = _normalize_time(value)
    if not normalized:
        return ""

    for label, time_value in MEDICATION_TIME_LABELS.items():
        if normalized == time_value:
            return label

    hour = int(normalized.split(":", 1)[0])
    if 5 <= hour < 11:
        return "아침"
    if 11 <= hour < 16:
        return "점심"
    if 16 <= hour < 22:
        return "저녁"
    if hour >= 22 or hour < 5:
        return "취침"
    return normalized


def _format_scheduled_time_labels(scheduled_times: list[str] | None) -> str:
    labels = []
    for scheduled_time in scheduled_times or []:
        label = _medication_time_label_for(scheduled_time)
        if label and label not in labels:
            labels.append(label)

    return "/".join(labels)


def _scheduled_time_labels_for_client(scheduled_times: list[str] | None) -> list[str]:
    labels = []
    for scheduled_time in scheduled_times or []:
        label = _medication_time_label_for(scheduled_time)
        if label in MEDICATION_TIME_LABELS and label not in labels:
            labels.append(label)

    return labels


def _default_times_for_count(times_per_day: int | None) -> list[str]:
    count = min(4, max(1, times_per_day or 1))
    return DEFAULT_MEDICATION_TIMES.get(count, DEFAULT_MEDICATION_TIMES[1])


def _build_dosage_note(
    *,
    scheduled_times: list[str] | None = None,
    meal_timing: str = "",
    times_per_day: int | None = None,
    days_supply: int | None = None,
    amount: str = "",
) -> str:
    parts = []
    time_labels = _format_scheduled_time_labels(scheduled_times)
    if time_labels:
        parts.append(time_labels)
    if meal_timing:
        parts.append(meal_timing)
    if times_per_day:
        parts.append(f"1일 {times_per_day}회")
    if days_supply:
        parts.append(f"{days_supply}일분")
    if _is_known_value(amount):
        parts.append(f"1회 {amount}")
    return " / ".join(parts)


def _build_medication_summary_note(entry: dict) -> str:
    parts = []
    meal_timing = entry.get("meal_timing") or ""
    times_per_day = entry.get("times_per_day")
    days_supply = entry.get("days_supply")
    amount = entry.get("amount", "")
    time_labels = _format_scheduled_time_labels(entry.get("scheduled_times"))

    if time_labels:
        parts.append(time_labels)
    if meal_timing:
        parts.append(meal_timing)
    if times_per_day:
        parts.append(f"1일 {times_per_day}회")
    else:
        parts.append("1일 횟수 확인 필요")
    if days_supply:
        parts.append(f"{days_supply}일분")
    if _is_known_value(amount):
        parts.append(f"1회 {amount}")

    return " / ".join(parts)


def _format_medication_entries_summary(entries: list[dict]) -> str:
    normalized_entries = _dedupe_medication_entries(entries)
    if not normalized_entries:
        return ""

    guide_lines = []
    easy_name_lines = []

    for entry in _merge_medication_entries(normalized_entries):
        guide_lines.append(f"- {entry['name']}: {_build_medication_summary_note(entry)}")
        easy_name = _normalize_easy_medication_name(entry.get("easy_name"))
        if easy_name:
            easy_name_lines.append(f"- {entry['name']}: {easy_name}")

    sections = [
        "[복용 중인 약]",
        *guide_lines,
    ]

    if easy_name_lines:
        sections.extend(["", "[쉬운 약 이름]", *easy_name_lines])

    return "\n".join(sections)


def _format_medication_entries_for_client(entries: list[dict]) -> list[dict]:
    result = []

    for entry in _merge_medication_entries(_dedupe_medication_entries(entries)):
        scheduled_times = entry.get("scheduled_times") or _default_times_for_count(
            entry.get("times_per_day")
        )
        time_slots = _scheduled_time_labels_for_client(scheduled_times)
        times_per_day = _coerce_positive_int(entry.get("times_per_day")) or len(time_slots) or 1

        result.append(
            {
                "name": entry["name"],
                "easyName": _normalize_easy_medication_name(entry.get("easy_name")),
                "mealTiming": _normalize_meal_timing(entry.get("meal_timing")) or "식후",
                "timesPerDay": times_per_day,
                "daysSupply": _coerce_positive_int(entry.get("days_supply")) or 7,
                "timeSlots": time_slots or _scheduled_time_labels_for_client(
                    _default_times_for_count(times_per_day)
                ),
                "scheduledTimes": scheduled_times,
            }
        )

    return result


def _parse_medication_entries_json(value: str | None) -> list[dict]:
    if not value or not str(value).strip():
        return []

    try:
        raw_entries = json.loads(value)
    except json.JSONDecodeError:
        return []

    if not isinstance(raw_entries, list):
        return []

    entries = []
    for raw_entry in raw_entries:
        if not isinstance(raw_entry, dict):
            continue

        name = _normalize_medication_name(raw_entry.get("name"))
        if not name:
            continue

        easy_name = _normalize_easy_medication_name(
            raw_entry.get("easyName")
            or raw_entry.get("easy_name")
            or raw_entry.get("simpleName")
            or raw_entry.get("simple_name")
            or raw_entry.get("displayName")
            or raw_entry.get("display_name")
            or raw_entry.get("categoryName")
            or raw_entry.get("category_name")
        )
        times_per_day = _coerce_positive_int(raw_entry.get("timesPerDay"), 1)
        days_supply = _coerce_positive_int(raw_entry.get("daysSupply"))
        meal_timing = _normalize_meal_timing(
            raw_entry.get("mealTiming") or raw_entry.get("meal_timing")
        )
        scheduled_times = []

        raw_scheduled_times = (
            raw_entry.get("scheduledTimes")
            or raw_entry.get("scheduled_times")
            or raw_entry.get("timeSlots")
            or raw_entry.get("time_slots")
            or []
        )
        if isinstance(raw_scheduled_times, str):
            raw_scheduled_times = re.split(r"[,/|]+", raw_scheduled_times)
        for item in raw_scheduled_times:
            for normalized_time in _normalize_times(item):
                if normalized_time and normalized_time not in scheduled_times:
                    scheduled_times.append(normalized_time)
            if not scheduled_times:
                normalized_time = _normalize_time(item)
                if normalized_time and normalized_time not in scheduled_times:
                    scheduled_times.append(normalized_time)

        if scheduled_times:
            normalized_scheduled_times = []
            for normalized_time in scheduled_times:
                if normalized_time not in normalized_scheduled_times:
                    normalized_scheduled_times.append(normalized_time)
            scheduled_times = normalized_scheduled_times

        if not scheduled_times:
            scheduled_times = _default_times_for_count(times_per_day)

        entries.append(
            {
                "name": name,
                "easy_name": easy_name,
                "meal_timing": meal_timing,
                "times_per_day": times_per_day,
                "days_supply": days_supply,
                "scheduled_times": scheduled_times,
                "amount": "",
            }
        )

    return entries


def _parse_structured_medication_summary(summary: str) -> list[dict]:
    entries: list[dict] = []
    text_value = str(summary or "")
    easy_name_map = _parse_easy_medication_map(text_value)

    def field_value(field_values: dict[str, str], *keys: str) -> str:
        for key in keys:
            value = field_values.get(key)
            if value is not None:
                return value
        return ""

    section_match = re.search(
        r"\[복약 구조화\]([\s\S]*?)(?=\n\s*\[|$)",
        text_value,
    )

    if section_match:
        for line in section_match.group(1).splitlines():
            if not line.strip().startswith("-"):
                continue

            field_values: dict[str, str] = {}
            for part in line.lstrip("-").split("|"):
                if ":" not in part:
                    continue
                key, value = part.split(":", 1)
                field_values[key.strip()] = value.strip()

            name = _normalize_medication_name(
                field_values.get("약 이름") or field_values.get("약이름")
            )
            if not name:
                continue

            times_per_day = _coerce_positive_int(
                field_value(
                    field_values,
                    "1일 복용 횟수",
                    "하루 복용 횟수",
                    "복용 횟수",
                    "횟수",
                )
            )
            days_supply = _coerce_positive_int(
                field_value(field_values, "처방 일수", "일수", "처방일수")
            )
            meal_timing = _normalize_meal_timing(
                field_value(field_values, "복용 시점", "식사 기준", "식전/식후")
            )
            scheduled_times = _normalize_times(
                field_value(field_values, "복용 시간", "시간")
            )
            if times_per_day and len(scheduled_times) < times_per_day:
                scheduled_times = _default_times_for_count(times_per_day)
            if not scheduled_times:
                scheduled_times = _default_times_for_count(times_per_day)
            amount = field_value(field_values, "1회 용량", "투약량", "용량")
            easy_name = _normalize_easy_medication_name(
                field_value(
                    field_values,
                    "쉬운 약 이름",
                    "쉬운이름",
                    "쉬운 이름",
                    "분류",
                )
            ) or _medication_easy_name_for(name, easy_name_map)

            entries.append(
                {
                    "name": name,
                    "easy_name": easy_name,
                    "meal_timing": meal_timing,
                    "times_per_day": times_per_day,
                    "days_supply": days_supply,
                    "scheduled_times": scheduled_times,
                    "amount": amount,
                }
            )

    if entries:
        return entries

    section_match = re.search(
        r"\[복약 안내\]([\s\S]*?)(?=\n\s*\[|$)",
        text_value,
    )

    if section_match:
        for line in section_match.group(1).splitlines():
            line_value = line.strip()
            if not line_value.startswith("-"):
                continue

            body = line_value.lstrip("-").strip()
            if ":" not in body and "：" not in body:
                continue

            separator = ":" if ":" in body else "："
            raw_name, raw_note = body.split(separator, 1)
            name = _normalize_medication_name(raw_name)
            if not name:
                continue

            note = raw_note.strip()
            times_per_day = _coerce_positive_int(
                re.search(r"1\s*일\s*(\d+)\s*회", note).group(1)
                if re.search(r"1\s*일\s*(\d+)\s*회", note)
                else None
            )
            days_supply = _coerce_positive_int(
                re.search(r"(\d+)\s*일\s*분?", note).group(1)
                if re.search(r"(\d+)\s*일\s*분?", note)
                else None
            )
            meal_timing = _normalize_meal_timing(note)

            entries.append(
                {
                    "name": name,
                    "easy_name": _medication_easy_name_for(name, easy_name_map),
                    "meal_timing": meal_timing,
                    "times_per_day": times_per_day,
                    "days_supply": days_supply,
                    "scheduled_times": _default_times_for_count(times_per_day),
                    "amount": "",
                }
            )

    if entries:
        return entries

    section_match = re.search(
        r"\[복용 중인 약\]([\s\S]*?)(?=\n\s*\[|$)",
        text_value,
    )

    if not section_match:
        return []

    for line in section_match.group(1).splitlines():
        if not line.strip().startswith("-"):
            continue

        body = line.lstrip("-").strip()
        raw_name = body
        raw_note = ""
        if ":" in body or "：" in body:
            separator = ":" if ":" in body else "："
            raw_name, raw_note = body.split(separator, 1)

        name = _normalize_medication_name(raw_name)
        if not name:
            continue

        times_per_day = _coerce_positive_int(
            re.search(r"1\s*일\s*(\d+)\s*회", raw_note).group(1)
            if re.search(r"1\s*일\s*(\d+)\s*회", raw_note)
            else None
        )
        days_supply = _coerce_positive_int(
            re.search(r"(\d+)\s*일\s*분?", raw_note).group(1)
            if re.search(r"(\d+)\s*일\s*분?", raw_note)
            else None
        )

        entries.append(
            {
                "name": name,
                "easy_name": _medication_easy_name_for(name, easy_name_map),
                "meal_timing": _normalize_meal_timing(raw_note),
                "times_per_day": times_per_day,
                "days_supply": days_supply,
                "scheduled_times": _default_times_for_count(times_per_day),
                "amount": "",
            }
        )

    return entries


def _parse_plain_medication_text(value: str | None) -> list[dict]:
    text_value = _strip_failed_document_summary_fragments(value)
    if not text_value:
        return []

    if "[" in text_value and "]" in text_value:
        structured_entries = _parse_structured_medication_summary(text_value)
        if structured_entries:
            return structured_entries

    entries = []
    for chunk in re.split(r"[\n,;/]+", text_value):
        if chunk.strip().startswith("["):
            continue

        name = _normalize_medication_name(chunk)
        if not name:
            continue

        entries.append(
            {
                "name": name,
                "easy_name": "",
                "meal_timing": "",
                "times_per_day": None,
                "days_supply": None,
                "scheduled_times": _default_times_for_count(1),
                "amount": "",
            }
        )

    return entries


def _dedupe_medication_entries(entries: list[dict]) -> list[dict]:
    seen = set()
    deduped = []

    for entry in entries:
        name = _normalize_medication_name(entry.get("name"))
        if not name:
            continue

        scheduled_times = entry.get("scheduled_times") or _default_times_for_count(
            entry.get("times_per_day")
        )

        normalized_entry = {
            **entry,
            "name": name,
        }

        for scheduled_time in scheduled_times:
            key = (name, scheduled_time)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(
                {
                    **normalized_entry,
                    "scheduled_times": [scheduled_time],
                }
            )

    return deduped


def _merge_medication_entries(*entry_groups: list[dict]) -> list[dict]:
    merged_by_name: dict[str, dict] = {}
    order: list[str] = []

    for entries in entry_groups:
        for entry in entries or []:
            name = _normalize_medication_name(entry.get("name"))
            if not name:
                continue

            key = _medication_match_key(name)
            if key not in merged_by_name:
                order.append(key)
                merged_by_name[key] = {
                    "name": name,
                    "easy_name": "",
                    "meal_timing": "",
                    "times_per_day": None,
                    "days_supply": None,
                    "scheduled_times": [],
                    "amount": "",
                }

            current = merged_by_name[key]
            for field in ("easy_name", "meal_timing", "times_per_day", "days_supply", "amount"):
                value = entry.get(field)
                if value:
                    current[field] = value

            scheduled_times = []
            for item in entry.get("scheduled_times") or []:
                for normalized_time in _normalize_times(item):
                    if normalized_time and normalized_time not in scheduled_times:
                        scheduled_times.append(normalized_time)
            if scheduled_times:
                for scheduled_time in scheduled_times:
                    if scheduled_time not in current["scheduled_times"]:
                        current["scheduled_times"].append(scheduled_time)

    merged_entries = []
    for key in order:
        entry = merged_by_name[key]
        if not entry["scheduled_times"]:
            entry["scheduled_times"] = _default_times_for_count(entry.get("times_per_day"))
        merged_entries.append(entry)

    return merged_entries


def _sync_medication_schedule_rows(
    db: Session,
    senior_user_id: str,
    entries: list[dict],
) -> None:
    normalized_entries = _dedupe_medication_entries(entries)

    db.execute(
        text(
            """
            UPDATE medications
            SET active = FALSE
            WHERE senior_user_id = :senior_user_id
            """
        ),
        {"senior_user_id": senior_user_id},
    )

    if not normalized_entries:
        return

    for entry in normalized_entries:
        dosage_note = _build_dosage_note(
            scheduled_times=entry.get("scheduled_times"),
            meal_timing=entry.get("meal_timing", ""),
            times_per_day=entry.get("times_per_day"),
            days_supply=entry.get("days_supply"),
            amount=entry.get("amount", ""),
        )
        easy_name = _normalize_easy_medication_name(entry.get("easy_name"))

        for scheduled_time in entry.get("scheduled_times") or _default_times_for_count(
            entry.get("times_per_day")
        ):
            db.execute(
                text(
                    """
                    INSERT INTO medications (
                        id,
                        senior_user_id,
                        name,
                        easy_name,
                        dosage_note,
                        scheduled_time,
                        repeat_daily,
                        active
                    )
                    VALUES (
                        :id,
                        :senior_user_id,
                        :name,
                        :easy_name,
                        :dosage_note,
                        CAST(:scheduled_time AS TIME),
                        TRUE,
                        TRUE
                    )
                    """
                ),
                {
                    "id": str(uuid4()),
                    "senior_user_id": senior_user_id,
                    "name": entry["name"],
                    "easy_name": easy_name or None,
                    "dosage_note": dosage_note,
                    "scheduled_time": scheduled_time,
                },
            )


async def _save_and_summarize_document(
    db: Session,
    image,
    folder_name: str,
    document_type: str,
    summary_title: str,
    parent_user_id: str,
) -> str:
    image_path = await save_upload_file(image, folder_name)

    try:
        summary = await run_in_threadpool(
            summarize_medical_image,
            image_path,
            summary_title,
        )

        if not summary or not str(summary).strip():
            summary = f"{summary_title} 이미지에서 내용을 인식하지 못했습니다."

    except Exception as e:
        print("summarize_medical_image error:", repr(e))
        summary = f"{summary_title} 이미지가 저장되었습니다. 요약은 나중에 다시 생성해야 합니다."

    db.add(
        CareDocument(
            id=str(uuid4()),
            elder_user_id=parent_user_id,
            document_type=document_type,
            image_path=image_path,
            summary=summary or "",
        )
    )

    return summary or ""


async def analyze_parent_medication_images(
    db: Session,
    parent_user_id: str,
    document_type: str,
    images,
) -> dict:
    profile = (
        db.query(ElderProfile)
        .filter(ElderProfile.user_id == parent_user_id)
        .first()
    )

    if not profile:
        raise ValueError("부모님 프로필을 찾을 수 없습니다.")

    normalized_document_type = "medication_bag" if document_type == "medication_bag" else "prescription"
    folder_name = "medication_bags" if normalized_document_type == "medication_bag" else "prescriptions"
    summary_title = "약 봉투" if normalized_document_type == "medication_bag" else "처방전"
    summaries: list[str] = []

    try:
        for image in images or []:
            summary = await _save_and_summarize_document(
                db=db,
                image=image,
                folder_name=folder_name,
                document_type=normalized_document_type,
                summary_title=summary_title,
                parent_user_id=parent_user_id,
            )
            summaries.append(summary)

        raw_medication_summary = merge_summaries("", "복약 문서", summaries)
        medication_entries = _parse_structured_medication_summary(raw_medication_summary)
        if not medication_entries:
            medication_entries = _parse_plain_medication_text(raw_medication_summary)

        db.commit()

        return {
            "message": "약 사진 분석이 완료되었습니다.",
            "summary": raw_medication_summary,
            "medications": _format_medication_entries_summary(medication_entries),
            "entries": _format_medication_entries_for_client(medication_entries),
        }
    except Exception:
        db.rollback()
        raise


async def update_parent_care_info_with_images(
    db: Session,
    parent_user_id: str,
    medications: str,
    diseases: str,
    allergies: str,
    hospital: str,
    doctor_contact: str,
    memo: str,
    medication_entries_json: str,
    prescription_images,
    medication_bag_images,
    disease_document_images,
    allergy_document_images,
):
    profile = (
        db.query(ElderProfile)
        .filter(ElderProfile.user_id == parent_user_id)
        .first()
    )

    if not profile:
        raise ValueError("부모님 프로필을 찾을 수 없습니다.")

    medication_document_summaries: list[str] = []
    disease_summaries: list[str] = []
    allergy_summaries: list[str] = []

    try:
        for image in prescription_images or []:
            summary = await _save_and_summarize_document(
                db=db,
                image=image,
                folder_name="prescriptions",
                document_type="prescription",
                summary_title="처방전",
                parent_user_id=parent_user_id,
            )
            medication_document_summaries.append(summary)

        for image in medication_bag_images or []:
            summary = await _save_and_summarize_document(
                db=db,
                image=image,
                folder_name="medication_bags",
                document_type="medication_bag",
                summary_title="약 봉투",
                parent_user_id=parent_user_id,
            )
            medication_document_summaries.append(summary)

        for image in disease_document_images or []:
            summary = await _save_and_summarize_document(
                db=db,
                image=image,
                folder_name="disease_documents",
                document_type="disease",
                summary_title="진단서",
                parent_user_id=parent_user_id,
            )
            disease_summaries.append(summary)

        for image in allergy_document_images or []:
            summary = await _save_and_summarize_document(
                db=db,
                image=image,
                folder_name="allergy_documents",
                document_type="allergy",
                summary_title="알레르기 관련 진단서",
                parent_user_id=parent_user_id,
            )
            allergy_summaries.append(summary)

        raw_medication_summary = merge_summaries(
            medications,
            "복약 문서",
            medication_document_summaries,
        )
        explicit_medication_entries = _parse_medication_entries_json(
            medication_entries_json
        )
        recognized_medication_entries = _parse_structured_medication_summary(
            raw_medication_summary
        )
        plain_medication_entries = _parse_plain_medication_text(medications)
        medication_entries = _merge_medication_entries(
            plain_medication_entries,
            recognized_medication_entries,
            explicit_medication_entries,
        )
        if medication_entries:
            profile.medications = _format_medication_entries_summary(
                medication_entries
            )
        else:
            profile.medications = (medications or "").strip()
        _sync_medication_schedule_rows(db, parent_user_id, medication_entries)

        profile.diseases = merge_summaries(
            diseases,
            "진단서",
            disease_summaries,
        )

        profile.allergies = merge_summaries(
            allergies,
            "알레르기 문서",
            allergy_summaries,
        )

        profile.hospital = hospital or ""
        profile.doctor_contact = doctor_contact or ""
        profile.memo = memo or ""

        db.commit()
        db.refresh(profile)

        return {
            "message": "건강정보와 문서 요약이 저장되었습니다.",
            "medications": profile.medications or "",
            "diseases": profile.diseases or "",
            "allergies": profile.allergies or "",
            "hospital": profile.hospital or "",
            "doctor_contact": profile.doctor_contact or "",
            "memo": profile.memo or "",
        }

    except Exception as e:
        db.rollback()
        print("update_parent_care_info_with_images error:", repr(e))
        raise
