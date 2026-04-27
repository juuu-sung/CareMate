from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.elder_profile import ElderProfile
from app.schemas.agent_profile import (
    AgentProfileUpdateRequest,
    AgentProfileResponse,
)

router = APIRouter(
    prefix="/elder-profile",
    tags=["elder-profile"],
)


@router.get("/agent", response_model=AgentProfileResponse)
def get_agent_profile(
    elder_user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    profile = (
        db.query(ElderProfile)
        .filter(ElderProfile.user_id == elder_user_id)
        .first()
    )

    if not profile:
        return AgentProfileResponse(
            elder_user_id=elder_user_id,
            agent_name="케어",
            agent_voice="alloy",
        )

    return AgentProfileResponse(
        elder_user_id=elder_user_id,
        agent_name=profile.agent_name or "케어",
        agent_voice=profile.agent_voice or "alloy",
    )


@router.patch("/agent", response_model=AgentProfileResponse)
def update_agent_profile(
    request: AgentProfileUpdateRequest,
    db: Session = Depends(get_db),
):
    profile = (
        db.query(ElderProfile)
        .filter(ElderProfile.user_id == request.elder_user_id)
        .first()
    )

    if not profile:
        raise HTTPException(
            status_code=404,
            detail="Elder profile not found",
        )

    if request.agent_name is not None:
        profile.agent_name = request.agent_name.strip()

    if request.agent_voice is not None:
        profile.agent_voice = request.agent_voice.strip()

    db.commit()
    db.refresh(profile)

    return AgentProfileResponse(
        elder_user_id=request.elder_user_id,
        agent_name=profile.agent_name or "케어",
        agent_voice=profile.agent_voice or "alloy",
    )