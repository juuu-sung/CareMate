from sqlalchemy.orm import Session

from app.models.guardian_link import GuardianLink
from app.schemas.alerts import AlertEventCreateRequest, AlertEventCreateResponse, AlertItem
from app.services.guardian_alert_service import create_guardian_alert


def list_alerts() -> list[AlertItem]:
    return [
        AlertItem(
            type="medication_missed",
            message="복약 알림 3회 미응답",
            created_at="2026-03-24T09:30:00+09:00",
        )
    ]


def create_event_alert(db: Session, payload: AlertEventCreateRequest) -> AlertEventCreateResponse:
    link = (
        db.query(GuardianLink)
        .filter(
            GuardianLink.link_code == payload.link_code,
            GuardianLink.elder_user_id == payload.elder_user_id,
        )
        .first()
    )

    if not link:
        raise ValueError("연동된 보호자 정보를 찾지 못했습니다.")

    created = create_guardian_alert(
        db,
        elder_user_id=payload.elder_user_id,
        alert_type=payload.type,
        message=payload.message,
        severity=payload.severity,
        dedupe_minutes=15,
    )
    db.commit()

    return AlertEventCreateResponse(
        elder_user_id=payload.elder_user_id,
        link_code=payload.link_code,
        type=payload.type,
        message=payload.message,
        created=created,
    )
