from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import CarePrincipal, get_current_care_principal, get_db
from app.schemas.modes import CareModeResponse, CareModeUpdateRequest
from app.services.mode_service import get_current_mode, update_mode

router = APIRouter()


@router.get("/current", response_model=CareModeResponse)
def current_mode(
    principal: CarePrincipal = Depends(get_current_care_principal),
    db: Session = Depends(get_db),
) -> CareModeResponse:
    return get_current_mode(db, elder_user_id=principal.elder_user_id)


@router.patch("/current", response_model=CareModeResponse)
def patch_mode(
    payload: CareModeUpdateRequest,
    principal: CarePrincipal = Depends(get_current_care_principal),
    db: Session = Depends(get_db),
) -> CareModeResponse:
    try:
        return update_mode(db, payload, elder_user_id=principal.elder_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
