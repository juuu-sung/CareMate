from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User
from app.models.guardian_link import GuardianLink
from app.schemas.guardian_contact import GuardianContactResponse
from app.schemas.guardian_location import GuardianLatestLocationResponse
from app.services.guardian_location_service import get_latest_elder_location

router = APIRouter(
    prefix="/guardian-link",
    tags=["guardian-link"],
)


@router.get("/guardian-contact", response_model=GuardianContactResponse)
def get_guardian_contact(
    link_code: str = Query(...),
    db: Session = Depends(get_db),
):
    print("guardian-contact 요청")
    print("link_code:", link_code)

    link = (
        db.query(GuardianLink)
        .filter(GuardianLink.link_code == link_code)
        .first()
    )

    print("조회된 guardian_link:", link)

    if not link:
        raise HTTPException(
            status_code=404,
            detail="연결된 보호자 정보를 찾을 수 없습니다."
        )

    guardian = (
        db.query(User)
        .filter(User.id == link.guardian_user_id)
        .first()
    )

    print("조회된 guardian user:", guardian)

    if not guardian:
        raise HTTPException(
            status_code=404,
            detail="보호자 사용자 정보를 찾을 수 없습니다."
        )

    return GuardianContactResponse(
        guardian_user_id=guardian.id,
        guardian_name=guardian.name or "",
        guardian_phone=guardian.phone or "",
    )


@router.get("/latest-location", response_model=GuardianLatestLocationResponse)
def get_latest_location(
    elder_user_id: str = Query(...),
    link_code: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return get_latest_elder_location(db, elder_user_id=elder_user_id, link_code=link_code)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
