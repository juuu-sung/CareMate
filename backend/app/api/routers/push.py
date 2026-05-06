from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.push import (
    PushTokenDisableRequest,
    PushTokenDisableResponse,
    PushTokenRegisterRequest,
    PushTokenRegisterResponse,
)
from app.services.push_notification_service import (
    disable_push_token,
    register_push_token,
)

router = APIRouter()


@router.post("/register", response_model=PushTokenRegisterResponse)
def register_device_push_token(
    payload: PushTokenRegisterRequest,
    db: Session = Depends(get_db),
):
    try:
        return register_push_token(db, payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.post("/disable", response_model=PushTokenDisableResponse)
def disable_device_push_token(
    payload: PushTokenDisableRequest,
    db: Session = Depends(get_db),
):
    try:
        return PushTokenDisableResponse(disabled_count=disable_push_token(db, payload))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
