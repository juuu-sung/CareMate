from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.elder_profile import AgentProfileUpdateRequest, AgentProfileResponse
from app.services.elder_profile_service import update_agent_profile, get_agent_profile

router = APIRouter(prefix="/elder-profile", tags=["elder-profile"])


@router.patch("/agent", response_model=AgentProfileResponse)
def patch_agent_profile(
    payload: AgentProfileUpdateRequest,
    db: Session = Depends(get_db),
):
    return update_agent_profile(db, payload)


@router.get("/agent", response_model=AgentProfileResponse)
def read_agent_profile(
    elder_user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    return get_agent_profile(db, elder_user_id)