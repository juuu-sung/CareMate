from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_optional_guardian
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
from app.services.guardian_auth_service import GuardianPrincipal

router = APIRouter()


@router.post("/register", response_model=PushTokenRegisterResponse)
def register_device_push_token(
    payload: PushTokenRegisterRequest,
    principal: GuardianPrincipal | None = Depends(get_optional_guardian),
    db: Session = Depends(get_db),
):
    try:
        if payload.user_role == "guardian":
            if principal is None:
                raise HTTPException(status_code=401, detail="보호자 로그인이 필요합니다.")
            payload = payload.model_copy(
                update={
                    "user_id": principal.guardian_user_id,
                    "elder_user_id": principal.elder_user_id,
                    "link_code": principal.link_code,
                }
            )
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
