from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_guardian, get_optional_guardian
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
    link_code: str | None = Query(default=None),
    principal: GuardianPrincipal | None = Depends(get_optional_guardian),
    db: Session = Depends(get_db),
):
    if principal is not None:
        if elder_user_id != principal.elder_user_id:
            raise HTTPException(status_code=403, detail="다른 사용자의 편지에는 접근할 수 없습니다.")
        effective_link_code = principal.link_code
    elif link_code:
        effective_link_code = link_code
    else:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")

    link = (
        db.query(GuardianLink)
        .filter(
            GuardianLink.link_code == effective_link_code,
            GuardianLink.elder_user_id == elder_user_id,
        )
        .first()
    )

    if not link:
        raise HTTPException(status_code=404, detail="연결된 보호자 정보를 찾을 수 없습니다.")

    letters = (
        db.query(Letter)
        .filter(
            Letter.elder_user_id == elder_user_id,
            Letter.link_code == effective_link_code,
        )
        .order_by(Letter.created_at.desc())
        .all()
    )

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
