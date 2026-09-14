from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import (
    CarePrincipal,
    get_current_care_principal,
    get_db,
    require_elder_access,
)
from app.services.schedule_service import list_schedules

router = APIRouter()


@router.get("")
def get_schedules(
    elder_user_id: str | None = Query(default=None),
    senior_user_id: str | None = Query(default=None),
    principal: CarePrincipal = Depends(get_current_care_principal),
    db: Session = Depends(get_db),
):
    target_user_id = require_elder_access(
        principal,
        elder_user_id,
        senior_user_id,
    )
    items = list_schedules(db=db, senior_user_id=target_user_id)
    return {"items": items}
