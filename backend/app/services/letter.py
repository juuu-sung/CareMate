from sqlalchemy.orm import Session

from app.models.guardian_link import GuardianLink
from app.models.letter import Letter
from app.models.user import User
from app.schemas.letter import LetterCreateRequest


def send_letter_from_guardian(
    db: Session,
    guardian_user_id: str,
    payload: LetterCreateRequest,
):
    link = (
        db.query(GuardianLink)
        .filter(GuardianLink.link_code == payload.link_code)
        .first()
    )

    if not link:
        raise ValueError("유효하지 않은 연동 코드입니다.")

    if not link.guardian_user_id:
        raise ValueError("아직 보호자와 연결되지 않은 연동 코드입니다.")

    if link.guardian_user_id != guardian_user_id:
        raise ValueError("해당 연동 코드는 현재 보호자 계정과 연결되어 있지 않습니다.")

    new_letter = Letter(
        link_code=link.link_code,
        guardian_user_id=link.guardian_user_id,
        elder_user_id=link.elder_user_id,
        sender_role="guardian",
        content=payload.content,
    )

    db.add(new_letter)
    db.commit()
    db.refresh(new_letter)
    return new_letter


def send_letter_from_elder(
    db: Session,
    elder_user_id: str,
    payload: LetterCreateRequest,
):
    link = (
        db.query(GuardianLink)
        .filter(GuardianLink.link_code == payload.link_code)
        .first()
    )

    if not link:
        raise ValueError("유효하지 않은 연동 코드입니다.")

    if link.elder_user_id != elder_user_id:
        raise ValueError("해당 연동 코드는 현재 부모님 계정과 연결되어 있지 않습니다.")

    if not link.guardian_user_id:
        raise ValueError("아직 보호자가 연결되지 않았습니다.")

    new_letter = Letter(
        link_code=link.link_code,
        guardian_user_id=link.guardian_user_id,
        elder_user_id=link.elder_user_id,
        sender_role="elder",
        content=payload.content,
    )

    db.add(new_letter)
    db.commit()
    db.refresh(new_letter)
    return new_letter


def get_letters_by_link_code(db: Session, link_code: str):
    link = (
        db.query(GuardianLink)
        .filter(GuardianLink.link_code == link_code)
        .first()
    )

    if not link:
        raise ValueError("유효하지 않은 연동 코드입니다.")

    letters = (
        db.query(Letter)
        .filter(Letter.link_code == link_code)
        .order_by(Letter.created_at.asc())
        .all()
    )
    return letters


def get_letters_for_guardian(db: Session, guardian_user_id: str):
    letters = (
        db.query(Letter)
        .filter(Letter.guardian_user_id == guardian_user_id)
        .order_by(Letter.created_at.desc())
        .all()
    )
    return letters


def get_letters_for_elder(db: Session, elder_user_id: str):
    letters = (
        db.query(Letter)
        .filter(Letter.elder_user_id == elder_user_id)
        .order_by(Letter.created_at.desc())
        .all()
    )
    return letters