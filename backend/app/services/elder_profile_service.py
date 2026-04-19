from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.elder_profile import ElderProfile
from app.models.user import User
from app.schemas.elder_profile import AgentProfileUpdateRequest


def update_agent_profile(db: Session, payload: AgentProfileUpdateRequest):
    profile = (
        db.query(ElderProfile)
        .filter(ElderProfile.user_id == payload.elder_user_id)
        .first()
    )

    if not profile:
        raise HTTPException(status_code=404, detail="어르신 프로필을 찾을 수 없습니다.")

    if payload.agent_voice is not None:
        profile.agent_voice = payload.agent_voice

    if payload.agent_name is not None:
        profile.agent_name = payload.agent_name

    db.add(profile)
    db.commit()
    db.refresh(profile)

    return {
        "elder_user_id": profile.user_id,
        "agent_voice": profile.agent_voice,
        "agent_name": profile.agent_name,
    }


def get_agent_profile(db: Session, elder_user_id: str):
    profile = (
        db.query(ElderProfile)
        .filter(ElderProfile.user_id == elder_user_id)
        .first()
    )

    if not profile:
        raise HTTPException(status_code=404, detail="어르신 프로필을 찾을 수 없습니다.")

    return {
        "elder_user_id": profile.user_id,
        "agent_voice": profile.agent_voice,
        "agent_name": profile.agent_name,
    }


def get_elder_profile_context(user_id: str, db: Session) -> str:
    profile = (
        db.query(ElderProfile)
        .filter(ElderProfile.user_id == user_id)
        .first()
    )

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    name = (user.name or "").strip() if user and user.name else "미등록"

    if not profile:
        return (
            "어르신 프로필 참고 정보:\n"
            f"- 이름: {name}\n"
            "- 보유 질환: 없음\n"
            "- 복용 약물: 없음\n"
            "- 알레르기/주의사항: 없음\n"
            "- 추가 메모: 없음"
        )

    diseases = (profile.diseases or "").strip() or "없음"
    medications = (profile.medications or "").strip() or "없음"
    allergies = (profile.allergies or "").strip() or "없음"
    notes = (profile.memo or "").strip() or "없음"

    return (
        "어르신 프로필 참고 정보:\n"
        f"- 이름: {name}\n"
        f"- 보유 질환: {diseases}\n"
        f"- 복용 약물: {medications}\n"
        f"- 알레르기/주의사항: {allergies}\n"
        f"- 추가 메모: {notes}"
    )