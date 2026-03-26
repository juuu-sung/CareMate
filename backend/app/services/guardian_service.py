from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.guardians import GuardianDashboardResponse


def get_guardian_dashboard(db: Session) -> GuardianDashboardResponse:
    senior = db.execute(
        text(
            """
            SELECT id, name
            FROM users
            WHERE role = 'senior'
            ORDER BY created_at ASC
            LIMIT 1
            """
        )
    ).mappings().first()

    if not senior:
        return GuardianDashboardResponse(
            care_mode="basic",
            check_in_status="pending",
            latest_location_status="unavailable",
            open_alert_count=0,
            today_medication_pending_count=0,
            today_schedule_count=0,
        )

    senior_id = senior["id"]

    care_profile = db.execute(
        text(
            """
            SELECT mode
            FROM care_profiles
            WHERE senior_user_id = :senior_user_id
            LIMIT 1
            """
        ),
        {"senior_user_id": senior_id},
    ).mappings().first()

    latest_check_in = db.execute(
        text(
            """
            SELECT status
            FROM check_ins
            WHERE senior_user_id = :senior_user_id
            ORDER BY requested_at DESC
            LIMIT 1
            """
        ),
        {"senior_user_id": senior_id},
    ).mappings().first()

    latest_location = db.execute(
        text(
            """
            SELECT latitude, longitude, captured_at
            FROM locations
            WHERE senior_user_id = :senior_user_id
            ORDER BY captured_at DESC
            LIMIT 1
            """
        ),
        {"senior_user_id": senior_id},
    ).mappings().first()

    alert_counts = db.execute(
        text(
            """
            SELECT COUNT(*) AS count
            FROM alerts
            WHERE senior_user_id = :senior_user_id
              AND status = 'open'
            """
        ),
        {"senior_user_id": senior_id},
    ).scalar_one()

    medication_count = db.execute(
        text(
            """
            SELECT COUNT(*) AS count
            FROM medications
            WHERE senior_user_id = :senior_user_id
              AND active = TRUE
            """
        ),
        {"senior_user_id": senior_id},
    ).scalar_one()

    schedule_count = db.execute(
        text(
            """
            SELECT COUNT(*) AS count
            FROM schedules
            WHERE senior_user_id = :senior_user_id
              AND DATE(scheduled_at) = :today
              AND status = 'scheduled'
            """
        ),
        {"senior_user_id": senior_id, "today": date.today()},
    ).scalar_one()

    return GuardianDashboardResponse(
        care_mode=care_profile["mode"] if care_profile else "basic",
        check_in_status=latest_check_in["status"] if latest_check_in else "pending",
        latest_location_status="available" if latest_location else "unavailable",
        latest_location_label=_format_location_label(latest_location),
        latest_location_captured_at=latest_location["captured_at"].isoformat() if latest_location else None,
        open_alert_count=alert_counts or 0,
        today_medication_pending_count=medication_count or 0,
        today_schedule_count=schedule_count or 0,
    )


def _format_location_label(location_row) -> str | None:
    if not location_row:
        return None

    latitude = round(location_row["latitude"], 4)
    longitude = round(location_row["longitude"], 4)
    return f"{latitude}, {longitude}"
