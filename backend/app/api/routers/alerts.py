import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.api.deps import get_current_elder, get_current_guardian
from app.schemas.alerts import AlertEventCreateRequest, AlertEventCreateResponse, AlertItem, AlertSweepResponse
from app.services.alert_sweep_service import sweep_time_based_alerts
from app.services.alert_service import create_event_alert, list_alerts
from app.services.elder_auth_service import ElderPrincipal
from app.services.guardian_auth_service import GuardianPrincipal

router = APIRouter()


@router.get("", response_model=list[AlertItem])
def get_alerts(
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
) -> list[AlertItem]:
    return list_alerts(
        db,
        elder_user_id=principal.elder_user_id,
    )


@router.post("/event", response_model=AlertEventCreateResponse)
def post_event_alert(
    payload: AlertEventCreateRequest,
    principal: ElderPrincipal = Depends(get_current_elder),
    db: Session = Depends(get_db),
):
    try:
        return create_event_alert(db, payload, elder_user_id=principal.elder_user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sweep", response_model=AlertSweepResponse)
def sweep_alerts(
    db: Session = Depends(get_db),
    x_caremate_sweep_token: str | None = Header(default=None),
):
    configured_token = settings.alert_sweep_token
    if not configured_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="알림 점검 토큰이 설정되지 않았습니다.",
        )
    if not x_caremate_sweep_token or not hmac.compare_digest(
        x_caremate_sweep_token,
        configured_token,
    ):
        raise HTTPException(status_code=403, detail="알림 점검 권한이 없습니다.")

    return AlertSweepResponse(**sweep_time_based_alerts(db))
