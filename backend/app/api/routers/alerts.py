from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.alerts import AlertEventCreateRequest, AlertEventCreateResponse, AlertItem
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
