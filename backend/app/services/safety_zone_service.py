from __future__ import annotations

from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.guardian_link import GuardianLink
from app.schemas.safety_zone import SafetyZoneCreateRequest, SafetyZoneUpdateRequest
from app.services.guardian_alert_service import create_guardian_alert


EARTH_RADIUS_METERS = 6_371_000


def list_safety_zones(db: Session, *, elder_user_id: str, link_code: str) -> list[dict[str, Any]]:
    _validate_guardian_link(db, elder_user_id=elder_user_id, link_code=link_code)

    rows = db.execute(
        text(
            f"""
            SELECT {_zone_projection()}
            FROM safety_zones
            WHERE senior_user_id = :elder_user_id
            ORDER BY enabled DESC, created_at DESC
            """
        ),
        {"elder_user_id": elder_user_id},
    ).mappings().all()

    return [_format_zone(row) for row in rows]


def create_safety_zone(
    db: Session,
    *,
    elder_user_id: str,
    link_code: str,
    payload: SafetyZoneCreateRequest,
) -> dict[str, Any]:
    _validate_guardian_link(db, elder_user_id=elder_user_id, link_code=link_code)
    label = _clean_label(payload.label)
    address = _clean_address(payload.address)

    row = db.execute(
        text(
            f"""
            INSERT INTO safety_zones (
                senior_user_id,
                label,
                address,
                center_latitude,
                center_longitude,
                radius_meters,
                enabled
            )
            VALUES (
                :elder_user_id,
                :label,
                :address,
                :center_latitude,
                :center_longitude,
                :radius_meters,
                :enabled
            )
            RETURNING {_zone_projection()}
            """
        ),
        {
            "elder_user_id": elder_user_id,
            "label": label,
            "address": address,
            "center_latitude": payload.center_latitude,
            "center_longitude": payload.center_longitude,
            "radius_meters": payload.radius_meters,
            "enabled": payload.enabled,
        },
    ).mappings().one()
    db.commit()

    return _format_zone(row)


def update_safety_zone(
    db: Session,
    *,
    elder_user_id: str,
    link_code: str,
    zone_id: str,
    payload: SafetyZoneUpdateRequest,
) -> dict[str, Any]:
    _validate_guardian_link(db, elder_user_id=elder_user_id, link_code=link_code)
    changes = payload.model_dump(exclude_unset=True)

    if "label" in changes and changes["label"] is not None:
        changes["label"] = _clean_label(changes["label"])
    if "address" in changes and changes["address"] is not None:
        changes["address"] = _clean_address(changes["address"])

    row = db.execute(
        text(
            f"""
            UPDATE safety_zones
            SET label = COALESCE(:label, label),
                address = COALESCE(:address, address),
                center_latitude = COALESCE(:center_latitude, center_latitude),
                center_longitude = COALESCE(:center_longitude, center_longitude),
                radius_meters = COALESCE(:radius_meters, radius_meters),
                enabled = COALESCE(:enabled, enabled),
                last_status = CASE
                    WHEN :reset_status THEN 'unknown'
                    ELSE last_status
                END,
                updated_at = NOW()
            WHERE id::text = :zone_id
              AND senior_user_id = :elder_user_id
            RETURNING {_zone_projection()}
            """
        ),
        {
            "elder_user_id": elder_user_id,
            "zone_id": zone_id,
            "label": changes.get("label"),
            "address": changes.get("address"),
            "center_latitude": changes.get("center_latitude"),
            "center_longitude": changes.get("center_longitude"),
            "radius_meters": changes.get("radius_meters"),
            "enabled": changes.get("enabled"),
            "reset_status": any(
                key in changes
                for key in ("center_latitude", "center_longitude", "radius_meters", "enabled")
            ),
        },
    ).mappings().first()

    if not row:
        raise ValueError("안전구역을 찾지 못했습니다.")

    db.commit()
    return _format_zone(row)


def delete_safety_zone(db: Session, *, elder_user_id: str, link_code: str, zone_id: str) -> dict:
    _validate_guardian_link(db, elder_user_id=elder_user_id, link_code=link_code)

    result = db.execute(
        text(
            """
            DELETE FROM safety_zones
            WHERE id::text = :zone_id
              AND senior_user_id = :elder_user_id
            """
        ),
        {"elder_user_id": elder_user_id, "zone_id": zone_id},
    )
    db.commit()

    return {"success": bool(result.rowcount)}


def evaluate_safety_zones_for_location(
    db: Session,
    *,
    elder_user_id: str,
    latitude: float,
    longitude: float,
    captured_at: datetime | None = None,
) -> None:
    checked_at = captured_at or datetime.now(timezone.utc)
    zones = db.execute(
        text(
            """
            SELECT
                id::text AS id,
                label,
                center_latitude,
                center_longitude,
                radius_meters,
                last_status
            FROM safety_zones
            WHERE senior_user_id = :elder_user_id
              AND enabled = TRUE
            """
        ),
        {"elder_user_id": elder_user_id},
    ).mappings().all()

    for zone in zones:
        distance_meters = _haversine_meters(
            latitude,
            longitude,
            float(zone["center_latitude"]),
            float(zone["center_longitude"]),
        )
        next_status = "outside" if distance_meters > int(zone["radius_meters"]) else "inside"
        was_outside = zone["last_status"] == "outside"

        if next_status == "outside" and not was_outside:
            create_guardian_alert(
                db,
                elder_user_id=elder_user_id,
                alert_type="safety_zone_exit",
                message=f"{zone['label']} 안전구역을 벗어났어요.",
                severity="high",
                dedupe_minutes=30,
            )
            _update_zone_status(
                db,
                zone_id=zone["id"],
                status=next_status,
                checked_at=checked_at,
                mark_exit=True,
            )
        else:
            _update_zone_status(
                db,
                zone_id=zone["id"],
                status=next_status,
                checked_at=checked_at,
                mark_exit=False,
            )


def _update_zone_status(
    db: Session,
    *,
    zone_id: str,
    status: str,
    checked_at: datetime,
    mark_exit: bool,
) -> None:
    db.execute(
        text(
            """
            UPDATE safety_zones
            SET last_status = :status,
                last_checked_at = :checked_at,
                last_exit_alert_at = CASE
                    WHEN :mark_exit THEN :checked_at
                    ELSE last_exit_alert_at
                END,
                updated_at = NOW()
            WHERE id::text = :zone_id
            """
        ),
        {
            "zone_id": zone_id,
            "status": status,
            "checked_at": checked_at,
            "mark_exit": mark_exit,
        },
    )


def _validate_guardian_link(db: Session, *, elder_user_id: str, link_code: str):
    normalized_link_code = (link_code or "").strip().upper()
    link = (
        db.query(GuardianLink)
        .filter(
            GuardianLink.link_code == normalized_link_code,
            GuardianLink.elder_user_id == elder_user_id,
        )
        .first()
    )

    if not link:
        raise ValueError("안전구역을 관리할 수 있는 연동 정보를 찾지 못했습니다.")

    return link


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    r_lat1 = radians(lat1)
    r_lat2 = radians(lat2)

    a = sin(d_lat / 2) ** 2 + cos(r_lat1) * cos(r_lat2) * sin(d_lon / 2) ** 2
    c = 2 * asin(min(1, sqrt(a)))
    return EARTH_RADIUS_METERS * c


def _clean_label(label: str) -> str:
    cleaned = label.strip()
    if not cleaned:
        raise ValueError("안전구역 이름을 입력해 주세요.")
    return cleaned


def _clean_address(address: str | None) -> str:
    return (address or "").strip()


def _format_zone(row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "senior_user_id": row["senior_user_id"],
        "label": row["label"],
        "address": row["address"] or "",
        "center_latitude": float(row["center_latitude"]),
        "center_longitude": float(row["center_longitude"]),
        "radius_meters": int(row["radius_meters"]),
        "enabled": bool(row["enabled"]),
        "last_status": row["last_status"],
        "last_checked_at": row["last_checked_at"],
        "last_exit_alert_at": row["last_exit_alert_at"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _zone_projection() -> str:
    return """
        id::text AS id,
        senior_user_id,
        label,
        address,
        center_latitude,
        center_longitude,
        radius_meters,
        enabled,
        last_status,
        last_checked_at,
        last_exit_alert_at,
        created_at,
        updated_at
    """
