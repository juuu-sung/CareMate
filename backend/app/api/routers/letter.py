from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.guardian_link import GuardianLink
from app.models.letter import Letter
from app.schemas.letter import (
    SendLetterRequest,
    SendLetterResponse,
    LetterListResponse,
    LetterItem,
)

router = APIRouter(prefix="/letters", tags=["letters"])


@router.post("/send", response_model=SendLetterResponse)
def send_letter(request: SendLetterRequest, db: Session = Depends(get_db)):
    link = (
        db.query(GuardianLink)
        .filter(GuardianLink.link_code == request.link_code)
        .first()
    )

    if not link:
        raise HTTPException(status_code=404, detail="유효한 link_code가 없습니다.")

    if str(link.elder_user_id) != str(request.elder_user_id):
        raise HTTPException(status_code=400, detail="elder_user_id가 link_code와 일치하지 않습니다.")

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
        link_code=new_letter.link_code,
        sender_role=new_letter.sender_role,
        created_at=new_letter.created_at,
    )


@router.get("/elder/{elder_user_id}", response_model=LetterListResponse)
def get_letters_for_elder(
    elder_user_id: str,
    link_code: str = Query(...),
    db: Session = Depends(get_db),
):
    link = (
        db.query(GuardianLink)
        .filter(
            GuardianLink.link_code == link_code,
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
            Letter.link_code == link_code,
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
                link_code=letter.link_code,
                sender_role=letter.sender_role,
            )
            for letter in letters
        ],
    )