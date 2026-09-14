from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import (
    CarePrincipal,
    get_current_care_principal,
    get_db,
    require_elder_access,
)
from app.models.elder_profile import ElderProfile
from app.schemas.agent_profile import (
    AgentProfileUpdateRequest,
    AgentProfileResponse,
)

router = APIRouter(
    prefix="/elder-profile",
    tags=["elder-profile"],
)


def build_agent_profile_response(
    elder_user_id: str,
    profile: ElderProfile | None,
) -> AgentProfileResponse:
    if not profile:
        return AgentProfileResponse(
            elder_user_id=elder_user_id,
            agent_name="케어",
            agent_voice="alloy",
            medications=None,
            allergies=None,
            diseases=None,
        )

    return AgentProfileResponse(
        elder_user_id=elder_user_id,
        agent_name=profile.agent_name or "케어",
        agent_voice=profile.agent_voice or "alloy",
        medications=profile.medications,
        allergies=profile.allergies,
        diseases=profile.diseases,
    )


@router.get("/agent", response_model=AgentProfileResponse)
def get_agent_profile(
    elder_user_id: str = Query(...),
    principal: CarePrincipal = Depends(get_current_care_principal),
    db: Session = Depends(get_db),
):
    cleaned_elder_user_id = require_elder_access(principal, elder_user_id)

    profile = (
        db.query(ElderProfile)
        .filter(ElderProfile.user_id == cleaned_elder_user_id)
        .first()
    )

    return build_agent_profile_response(
        elder_user_id=cleaned_elder_user_id,
        profile=profile,
    )


@router.patch("/agent", response_model=AgentProfileResponse)
def update_agent_profile(
    request: AgentProfileUpdateRequest,
    principal: CarePrincipal = Depends(get_current_care_principal),
    db: Session = Depends(get_db),
):
    cleaned_elder_user_id = require_elder_access(principal, request.elder_user_id)

    profile = (
        db.query(ElderProfile)
        .filter(ElderProfile.user_id == cleaned_elder_user_id)
        .first()
    )

    if not profile:
        raise HTTPException(
            status_code=404,
            detail="Elder profile not found",
        )

    if request.agent_name is not None:
        cleaned_agent_name = request.agent_name.strip()
        profile.agent_name = cleaned_agent_name if cleaned_agent_name else "케어"

    if request.agent_voice is not None:
        cleaned_agent_voice = request.agent_voice.strip()
        profile.agent_voice = cleaned_agent_voice if cleaned_agent_voice else "alloy"

    if request.medications is not None:
        profile.medications = request.medications.strip() or None

    if request.allergies is not None:
        profile.allergies = request.allergies.strip() or None

    if request.diseases is not None:
        profile.diseases = request.diseases.strip() or None

    db.commit()
    db.refresh(profile)

    return build_agent_profile_response(
        elder_user_id=cleaned_elder_user_id,
        profile=profile,
    )
