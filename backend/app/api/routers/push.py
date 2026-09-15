from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import CarePrincipal, get_current_care_principal, get_db
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
    principal: CarePrincipal = Depends(get_current_care_principal),
    db: Session = Depends(get_db),
):
    try:
        expected_role = "guardian" if principal.role == "guardian" else "elder"
        if payload.user_role != expected_role:
            raise HTTPException(status_code=403, detail="로그인 역할과 푸시 대상이 일치하지 않습니다.")
        return register_push_token(
            db,
            payload,
            user_id=principal.actor_user_id,
            elder_user_id=principal.elder_user_id,
            link_code=principal.link_code,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.post("/disable", response_model=PushTokenDisableResponse)
def disable_device_push_token(
    payload: PushTokenDisableRequest,
    principal: CarePrincipal = Depends(get_current_care_principal),
    db: Session = Depends(get_db),
):
    try:
        return PushTokenDisableResponse(
            disabled_count=disable_push_token(
                db,
                payload,
                user_id=principal.actor_user_id,
            )
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
