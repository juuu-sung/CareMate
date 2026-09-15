from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import (
    CarePrincipal,
    get_current_care_principal,
    get_current_guardian,
    require_elder_access,
)
from app.models.guardian_link import GuardianLink
from app.models.letter import Letter
from app.schemas.letter import (
    SendLetterRequest,
    SendLetterResponse,
    LetterListResponse,
    LetterItem,
)
from app.services.guardian_auth_service import GuardianPrincipal

router = APIRouter(prefix="/letters", tags=["letters"])


@router.post("/send", response_model=SendLetterResponse)
def send_letter(
    request: SendLetterRequest,
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    link = (
        db.query(GuardianLink)
        .filter(GuardianLink.id == principal.guardian_link_id)
        .first()
    )

    if not link:
        raise HTTPException(status_code=404, detail="유효한 link_code가 없습니다.")

    now = datetime.now(timezone.utc)

    new_letter = Letter(
        guardian_user_id=str(link.guardian_user_id),
        elder_user_id=str(link.elder_user_id),
        content=request.content.strip(),
        created_at=now,
        link_code=str(link.link_code),
        sender_role="guardian",
    )

    db.add(new_letter)
    db.commit()
    db.refresh(new_letter)

    return SendLetterResponse(
        success=True,
        message="편지가 저장되었습니다.",
        guardian_user_id=new_letter.guardian_user_id,
        elder_user_id=new_letter.elder_user_id,
        sender_role=new_letter.sender_role,
        created_at=new_letter.created_at,
    )


@router.get("/elder/{elder_user_id}", response_model=LetterListResponse)
def get_letters_for_elder(
    elder_user_id: str,
    principal: CarePrincipal = Depends(get_current_care_principal),
    db: Session = Depends(get_db),
):
    target_elder_user_id = require_elder_access(principal, elder_user_id)
    query = db.query(Letter).filter(Letter.elder_user_id == target_elder_user_id)
    if principal.role == "guardian":
        query = query.filter(Letter.guardian_user_id == principal.actor_user_id)
    letters = query.order_by(Letter.created_at.desc()).all()

    return LetterListResponse(
        success=True,
        letters=[
            LetterItem(
                guardian_user_id=letter.guardian_user_id,
                elder_user_id=letter.elder_user_id,
                content=letter.content,
                created_at=letter.created_at,
                sender_role=letter.sender_role,
            )
            for letter in letters
        ],
    )
