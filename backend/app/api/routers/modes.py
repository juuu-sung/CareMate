from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.modes import CareModeResponse, CareModeUpdateRequest
from app.services.mode_service import get_current_mode, update_mode

router = APIRouter()


@router.get("/current", response_model=CareModeResponse)
def current_mode(db: Session = Depends(get_db)) -> CareModeResponse:
    return get_current_mode(db)


@router.patch("/current", response_model=CareModeResponse)
def patch_mode(payload: CareModeUpdateRequest, db: Session = Depends(get_db)) -> CareModeResponse:
    try:
        return update_mode(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
