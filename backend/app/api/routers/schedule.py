from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.schedule_service import list_schedules as list_schedule_items

router = APIRouter()


@router.get("")
def list_schedules(db: Session = Depends(get_db)) -> dict[str, list[dict[str, str]]]:
    return {"items": list_schedule_items(db)}
