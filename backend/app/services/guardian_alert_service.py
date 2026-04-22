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
              AND status <> 'resolved'
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
    result = db.execute(
        text(
            """
            UPDATE alerts
            SET status = 'resolved'
            WHERE senior_user_id = :elder_user_id
              AND type = :alert_type
              AND status <> 'resolved'
            """
        ),
        {
            "elder_user_id": elder_user_id,
            "alert_type": alert_type,
        },
    )
    return bool(result.rowcount)


def update_guardian_alert_status(
    db: Session,
    *,
    elder_user_id: str,
    alert_id: str,
    status: str,
):
    row = db.execute(
        text(
            """
            UPDATE alerts
            SET status = :status
            WHERE senior_user_id = :elder_user_id
              AND id::text = :alert_id
              AND status <> 'resolved'
            RETURNING
                id::text AS id,
                type,
                severity,
                message,
                status,
                created_at
            """
        ),
        {
            "elder_user_id": elder_user_id,
            "alert_id": alert_id,
            "status": status,
        },
    ).mappings().first()

    if row:
        return row

    return db.execute(
        text(
            """
            SELECT
                id::text AS id,
                type,
                severity,
                message,
                status,
                created_at
            FROM alerts
            WHERE senior_user_id = :elder_user_id
              AND id::text = :alert_id
            LIMIT 1
            """
        ),
        {
            "elder_user_id": elder_user_id,
            "alert_id": alert_id,
        },
    ).mappings().first()


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
              AND status <> 'resolved'
            ORDER BY created_at DESC
            LIMIT 1
            """
        ),
        {
            "elder_user_id": elder_user_id,
            "alert_type": alert_type,
        },
    ).mappings().first()
