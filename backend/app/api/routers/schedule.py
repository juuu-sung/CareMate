from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.schedule_service import list_schedules

router = APIRouter()


@router.get("")
def get_schedules(
    elder_user_id: str | None = Query(default=None),
    senior_user_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    target_user_id = senior_user_id or elder_user_id
    items = list_schedules(db=db, senior_user_id=target_user_id)
    return {"items": items}