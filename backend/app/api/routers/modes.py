from fastapi import APIRouter

from app.schemas.modes import CareModeResponse, CareModeUpdateRequest
from app.services.mode_service import get_current_mode, update_mode

router = APIRouter()


@router.get("/current", response_model=CareModeResponse)
def current_mode() -> CareModeResponse:
    return get_current_mode()


@router.patch("/current", response_model=CareModeResponse)
def patch_mode(payload: CareModeUpdateRequest) -> CareModeResponse:
    return update_mode(payload)
