from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.guardian_link import GuardianLink
from app.schemas.location import LocationRequestPayload, LocationSyncRequest
from app.services.guardian_alert_service import (
    create_guardian_alert,
    get_open_guardian_alert,
    resolve_guardian_alerts,
)
from app.services.safety_zone_service import evaluate_safety_zones_for_location


def record_location(db: Session, payload: LocationSyncRequest) -> dict:
    link = (
        db.query(GuardianLink)
        .filter(
            GuardianLink.link_code == payload.link_code,
            GuardianLink.elder_user_id == payload.elder_user_id,
        )
        .first()
    )

    if not link:
        raise ValueError("위치를 기록할 수 있는 연동 정보를 찾지 못했습니다.")

    captured_at = datetime.now(timezone.utc)

    row = db.execute(
        text(
            """
            INSERT INTO locations (
                senior_user_id,
                latitude,
                longitude,
                source,
                captured_at
            )
            VALUES (
                :elder_user_id,
                :latitude,
                :longitude,
                :source,
                :captured_at
            )
            RETURNING latitude, longitude, source, captured_at
            """
        ),
        {
            "elder_user_id": payload.elder_user_id,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "source": payload.source,
            "captured_at": captured_at,
        },
    ).mappings().one()

    evaluate_safety_zones_for_location(
        db,
        elder_user_id=payload.elder_user_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        captured_at=captured_at,
    )
    resolve_guardian_alerts(
        db,
        elder_user_id=payload.elder_user_id,
        alert_type="location_request",
    )
    db.commit()

    return {
        "elder_user_id": payload.elder_user_id,
        "latitude": float(row["latitude"]),
        "longitude": float(row["longitude"]),
        "source": row["source"],
        "captured_at": row["captured_at"],
        "message": "위치가 저장되었습니다.",
    }


def request_location_refresh(db: Session, payload: LocationRequestPayload) -> dict:
    _validate_guardian_link(db, elder_user_id=payload.elder_user_id, link_code=payload.link_code)

    existing = get_open_guardian_alert(
        db,
        elder_user_id=payload.elder_user_id,
        alert_type="location_request",
    )

    if not existing:
        create_guardian_alert(
            db,
            elder_user_id=payload.elder_user_id,
            alert_type="location_request",
            message="보호자가 현재 위치 확인을 요청했어요.",
            severity="low",
            dedupe_minutes=10,
        )
        db.commit()
        existing = get_open_guardian_alert(
            db,
            elder_user_id=payload.elder_user_id,
            alert_type="location_request",
        )

    return {
        "elder_user_id": payload.elder_user_id,
        "link_code": payload.link_code,
        "pending": True,
        "requested_at": existing["created_at"] if existing else datetime.now(timezone.utc),
        "message": "위치 확인 요청을 전달했어요.",
    }


def get_location_request_status(db: Session, payload: LocationRequestPayload) -> dict:
    _validate_guardian_link(db, elder_user_id=payload.elder_user_id, link_code=payload.link_code)

    existing = get_open_guardian_alert(
        db,
        elder_user_id=payload.elder_user_id,
        alert_type="location_request",
    )

    return {
        "elder_user_id": payload.elder_user_id,
        "link_code": payload.link_code,
        "pending": bool(existing),
        "requested_at": existing["created_at"] if existing else None,
        "message": "대기 중인 위치 요청이 있습니다." if existing else "대기 중인 위치 요청이 없습니다.",
    }


def _validate_guardian_link(db: Session, *, elder_user_id: str, link_code: str):
    link = (
        db.query(GuardianLink)
        .filter(
            GuardianLink.link_code == link_code,
            GuardianLink.elder_user_id == elder_user_id,
        )
        .first()
    )

    if not link:
        raise ValueError("위치를 기록할 수 있는 연동 정보를 찾지 못했습니다.")

    return link
