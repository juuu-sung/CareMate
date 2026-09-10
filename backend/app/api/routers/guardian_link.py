from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_guardian
from app.schemas.guardian_location import GuardianLatestLocationResponse
from app.services.guardian_location_service import get_latest_elder_location
from app.services.guardian_auth_service import GuardianPrincipal

router = APIRouter(
    prefix="/guardian-link",
    tags=["guardian-link"],
)


@router.get("/latest-location", response_model=GuardianLatestLocationResponse)
def get_latest_location(
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    try:
        return get_latest_elder_location(
            db,
            elder_user_id=principal.elder_user_id,
            link_code=principal.link_code,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
