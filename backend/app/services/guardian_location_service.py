from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.guardian_link import GuardianLink


def get_latest_elder_location(db: Session, elder_user_id: str, link_code: str) -> dict:
    link = (
        db.query(GuardianLink)
        .filter(
            GuardianLink.link_code == link_code,
            GuardianLink.elder_user_id == elder_user_id,
        )
        .first()
    )

    if not link or not link.guardian_user_id:
        raise ValueError("연동된 보호자 정보를 찾을 수 없습니다.")

    row = db.execute(
        text(
            """
            SELECT latitude, longitude, source, captured_at
            FROM locations
            WHERE senior_user_id = :elder_user_id
            ORDER BY captured_at DESC
            LIMIT 1
            """
        ),
        {"elder_user_id": elder_user_id},
    ).mappings().first()

    if not row:
        return {
            "status": "unavailable",
            "elder_user_id": elder_user_id,
            "latitude": None,
            "longitude": None,
            "source": None,
            "captured_at": None,
            "label": "아직 수집된 위치 정보가 없습니다.",
        }

    return {
        "status": "available",
        "elder_user_id": elder_user_id,
        "latitude": float(row["latitude"]),
        "longitude": float(row["longitude"]),
        "source": row["source"],
        "captured_at": row["captured_at"],
        "label": "최신 위치를 확인할 수 있습니다.",
    }
