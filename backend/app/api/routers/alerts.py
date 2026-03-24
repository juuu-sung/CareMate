from fastapi import APIRouter

from app.schemas.alerts import AlertItem
from app.services.alert_service import list_alerts

router = APIRouter()


@router.get("", response_model=list[AlertItem])
def get_alerts() -> list[AlertItem]:
    return list_alerts()
