from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.alerts import AlertEventCreateRequest, AlertEventCreateResponse, AlertItem
from app.services.guardian_alert_service import create_guardian_alert


def list_alerts(db: Session, *, elder_user_id: str) -> list[AlertItem]:
    rows = db.execute(
        text(
            """
            SELECT id::text AS id, type, severity, status, message, created_at
            FROM alerts
            WHERE senior_user_id = :elder_user_id
            ORDER BY created_at DESC
            LIMIT 100
            """
        ),
        {"elder_user_id": elder_user_id},
    ).mappings().all()
    return [
        AlertItem(
            id=row["id"],
            type=row["type"],
            severity=row["severity"],
            status=row["status"],
            message=row["message"],
            created_at=row["created_at"].isoformat(),
        )
        for row in rows
    ]


def create_event_alert(
    db: Session,
    payload: AlertEventCreateRequest,
    *,
    elder_user_id: str,
) -> AlertEventCreateResponse:
    created = create_guardian_alert(
        db,
        elder_user_id=elder_user_id,
        alert_type=payload.type,
        message=payload.message,
        severity=payload.severity,
        dedupe_minutes=15,
    )
    db.commit()

    return AlertEventCreateResponse(
        elder_user_id=elder_user_id,
        type=payload.type,
        message=payload.message,
        created=created,
    )
