from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.agent import AgentSlots
from app.schemas.chat import CareMode
from app.services.guardian_alert_service import create_guardian_alert


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
            "time": item["scheduled_at"].strftime("%H:%M"),
            "status": item["status"],
            "date": _format_schedule_date(item["scheduled_at"]),
        }
        for item in items
    ]


def create_schedule_from_slots(db: Session, slots: AgentSlots, mode: CareMode) -> dict[str, str]:
    senior_user_id = _get_primary_elder_id(db)
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
            f"{created_row['title']} ({_format_schedule_date(created_row['scheduled_at'])} {created_row['scheduled_at'].strftime('%H:%M')})"
        ),
        severity="low",
        dedupe_minutes=60,
    )
    db.commit()

    return {
        "title": created_row["title"],
        "time": created_row["scheduled_at"].strftime("%H:%M"),
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
    now = datetime.now(timezone.utc)
    target_date = now.date()
    if slots.date == "내일":
        target_date = target_date + timedelta(days=1)
    elif slots.date == "모레":
        target_date = target_date + timedelta(days=2)

    hour = 9
    minute = 0
    if slots.time:
        normalized_time = slots.time.replace("오전", "").replace("오후", "").replace("분", "").strip()
        parts = normalized_time.split("시")
        hour = int(parts[0].strip())
        minute = int(parts[1].strip()) if len(parts) > 1 and parts[1].strip() else 0
        if "오후" in slots.time and hour < 12:
            hour += 12
        if "오전" in slots.time and hour == 12:
            hour = 0

    return datetime(
        target_date.year,
        target_date.month,
        target_date.day,
        hour,
        minute,
        tzinfo=timezone.utc,
    )


def _format_schedule_date(value: datetime) -> str:
    today = datetime.now(timezone.utc).date()
    if value.date() == today:
        return "오늘"
    if value.date() == today + timedelta(days=1):
        return "내일"
    return value.strftime("%Y-%m-%d")
