from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.schemas.alerts import AlertEventCreateRequest, AlertEventCreateResponse, AlertItem, AlertSweepResponse
from app.services.alert_sweep_service import sweep_time_based_alerts
from app.services.alert_service import create_event_alert, list_alerts

router = APIRouter()


@router.get("", response_model=list[AlertItem])
def get_alerts() -> list[AlertItem]:
    return list_alerts()


@router.post("/event", response_model=AlertEventCreateResponse)
def post_event_alert(
    payload: AlertEventCreateRequest,
    db: Session = Depends(get_db),
):
    try:
        return create_event_alert(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sweep", response_model=AlertSweepResponse)
def sweep_alerts(
    db: Session = Depends(get_db),
    x_caremate_sweep_token: str | None = Header(default=None),
):
    if settings.alert_sweep_token and x_caremate_sweep_token != settings.alert_sweep_token:
        raise HTTPException(status_code=403, detail="알림 점검 권한이 없습니다.")

    return AlertSweepResponse(**sweep_time_based_alerts(db))
