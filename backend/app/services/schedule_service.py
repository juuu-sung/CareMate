import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.agent import AgentSlots
from app.schemas.chat import CareMode
from app.services.guardian_alert_service import create_guardian_alert


SEOUL_TZ = ZoneInfo("Asia/Seoul")
WEEKDAY_TO_INDEX = {
    "월요일": 0,
    "화요일": 1,
    "수요일": 2,
    "목요일": 3,
    "금요일": 4,
    "토요일": 5,
    "일요일": 6,
}


def list_schedules(db: Session, elder_user_id: str | None = None) -> list[dict[str, str]]:
    senior_user_id = elder_user_id or _get_primary_elder_id(db)
    if not senior_user_id:
        return []

    items = db.execute(
        text(
            """
            SELECT title, scheduled_at, status
            FROM schedules
            WHERE senior_user_id = :senior_user_id
            ORDER BY scheduled_at ASC
            """
        ),
        {"senior_user_id": senior_user_id},
    ).mappings().all()

    if not items:
        return []

    return [
        {
            "title": item["title"],
            "time": _format_schedule_time(item["scheduled_at"]),
            "status": item["status"],
            "date": _format_schedule_date(item["scheduled_at"]),
            "scheduled_at": item["scheduled_at"].isoformat(),
        }
        for item in items
    ]


def create_schedule_from_slots(
    db: Session,
    slots: AgentSlots,
    mode: CareMode,
    elder_user_id: str | None = None,
) -> dict[str, str]:
    senior_user_id = elder_user_id or _get_primary_elder_id(db)
    if not senior_user_id:
        raise ValueError("일정을 등록할 어르신 계정을 찾을 수 없습니다.")

    scheduled_at = _resolve_scheduled_at(slots)
    created_row = db.execute(
        text(
            """
            INSERT INTO schedules (
                id,
                senior_user_id,
                title,
                description,
                scheduled_at,
                type,
                status
            )
            VALUES (
                gen_random_uuid(),
                :senior_user_id,
                :title,
                :description,
                :scheduled_at,
                'general',
                'scheduled'
            )
            RETURNING title, scheduled_at, status
            """
        ),
        {
            "senior_user_id": senior_user_id,
            "title": slots.title or "일정",
            "description": f"{mode} mode agent action",
            "scheduled_at": scheduled_at,
        },
    ).mappings().one()

    create_guardian_alert(
        db,
        elder_user_id=senior_user_id,
        alert_type="schedule_created",
        message=(
            f"새 일정이 등록되었어요: "
            f"{created_row['title']} ({_format_schedule_date(created_row['scheduled_at'])} {_format_schedule_time(created_row['scheduled_at'])})"
        ),
        severity="low",
        dedupe_minutes=60,
    )
    db.commit()

    return {
        "title": created_row["title"],
        "time": _format_schedule_time(created_row["scheduled_at"]),
        "status": created_row["status"],
        "date": _format_schedule_date(created_row["scheduled_at"]),
    }


def _get_primary_elder_id(db: Session) -> str | None:
    row = db.execute(
        text(
            """
            SELECT id
            FROM users
            WHERE role = 'elder'
            ORDER BY created_at ASC
            LIMIT 1
            """
        )
    ).mappings().first()
    return row["id"] if row else None


def _resolve_scheduled_at(slots: AgentSlots) -> datetime:
    now_local = datetime.now(SEOUL_TZ)
    target_date = _resolve_target_date(slots.date, now_local)
    hour, minute = _resolve_hour_minute(slots.time)

    local_scheduled_at = datetime(
        target_date.year,
        target_date.month,
        target_date.day,
        hour,
        minute,
        tzinfo=SEOUL_TZ,
    )
    return local_scheduled_at.astimezone(timezone.utc)


def _resolve_target_date(value: str | None, now_local: datetime) -> datetime.date:
    if not value or value == "오늘":
        return now_local.date()
    if value == "내일":
        return now_local.date() + timedelta(days=1)
    if value == "모레":
        return now_local.date() + timedelta(days=2)

    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return datetime.strptime(value, "%Y-%m-%d").date()

    weekday_value = value if value.endswith("요일") else f"{value}요일"
    if weekday_value in WEEKDAY_TO_INDEX:
        target_weekday = WEEKDAY_TO_INDEX[weekday_value]
        delta_days = (target_weekday - now_local.weekday()) % 7
        return now_local.date() + timedelta(days=delta_days)

    return now_local.date()


def _resolve_hour_minute(value: str | None) -> tuple[int, int]:
    if not value:
        return 9, 0

    normalized = re.sub(r"\s+", " ", value).strip()

    colon_match = re.search(r"\b(\d{1,2}):(\d{2})\b", normalized)
    if colon_match:
        hour = int(colon_match.group(1))
        minute = int(colon_match.group(2))
        return _apply_meridiem(normalized, hour, minute)

    hour_match = re.search(r"(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?", normalized)
    if hour_match:
        hour = int(hour_match.group(1))
        minute = int(hour_match.group(2) or 0)
        return _apply_meridiem(normalized, hour, minute)

    return 9, 0


def _apply_meridiem(value: str, hour: int, minute: int) -> tuple[int, int]:
    if "오후" in value and hour < 12:
        hour += 12
    if "오전" in value and hour == 12:
        hour = 0
    return hour, minute


def _format_schedule_date(value: datetime) -> str:
    local_value = value.astimezone(SEOUL_TZ)
    today = datetime.now(SEOUL_TZ).date()
    if local_value.date() == today:
        return "오늘"
    if local_value.date() == today + timedelta(days=1):
        return "내일"
    return local_value.strftime("%Y-%m-%d")


def _format_schedule_time(value: datetime) -> str:
    return value.astimezone(SEOUL_TZ).strftime("%H:%M")
