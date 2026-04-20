from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session


def create_guardian_alert(
    db: Session,
    *,
    elder_user_id: str,
    alert_type: str,
    message: str,
    severity: str = "medium",
    dedupe_minutes: int = 30,
):
    threshold = datetime.now(timezone.utc) - timedelta(minutes=dedupe_minutes)

    existing = db.execute(
        text(
            """
            SELECT 1
            FROM alerts
            WHERE senior_user_id = :elder_user_id
              AND type = :alert_type
              AND message = :message
              AND status = 'open'
              AND created_at >= :threshold
            LIMIT 1
            """
        ),
        {
            "elder_user_id": elder_user_id,
            "alert_type": alert_type,
            "message": message,
            "threshold": threshold,
        },
    ).first()

    if existing:
        return False

    db.execute(
        text(
            """
            INSERT INTO alerts (
                senior_user_id,
                type,
                severity,
                message,
                status
            )
            VALUES (
                :elder_user_id,
                :alert_type,
                :severity,
                :message,
                'open'
            )
            """
        ),
        {
            "elder_user_id": elder_user_id,
            "alert_type": alert_type,
            "severity": severity,
            "message": message,
        },
    )

    return True


def resolve_guardian_alerts(
    db: Session,
    *,
    elder_user_id: str,
    alert_type: str,
):
    db.execute(
        text(
            """
            UPDATE alerts
            SET status = 'resolved'
            WHERE senior_user_id = :elder_user_id
              AND type = :alert_type
              AND status = 'open'
            """
        ),
        {
            "elder_user_id": elder_user_id,
            "alert_type": alert_type,
        },
    )


def get_open_guardian_alert(
    db: Session,
    *,
    elder_user_id: str,
    alert_type: str,
):
    return db.execute(
        text(
            """
            SELECT created_at
            FROM alerts
            WHERE senior_user_id = :elder_user_id
              AND type = :alert_type
              AND status = 'open'
            ORDER BY created_at DESC
            LIMIT 1
            """
        ),
        {
            "elder_user_id": elder_user_id,
            "alert_type": alert_type,
        },
    ).mappings().first()
