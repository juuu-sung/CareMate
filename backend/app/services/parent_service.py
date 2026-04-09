from uuid import uuid4
from datetime import datetime
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.elder_profile import ElderProfile
from app.models.guardian_link import GuardianLink
from app.rules.code_generator import generate_link_code
from app.schemas.parent import ParentSignupRequest, ParentCareInfoUpdateRequest


def calculate_age_from_birth(birth: str | None) -> int | None:
    if not birth:
        return None

    numbers = "".join(ch for ch in birth if ch.isdigit())
    if len(numbers) < 8:
        return None

    year = int(numbers[0:4])
    month = int(numbers[4:6])
    day = int(numbers[6:8])

    today = datetime.today().date()
    age = today.year - year - ((today.month, today.day) < (month, day))
    return age


def _generate_unique_link_code(db: Session) -> str:
    while True:
        code = generate_link_code()
        exists = db.query(GuardianLink).filter(GuardianLink.link_code == code).first()
        if not exists:
            return code


def create_parent(db: Session, payload: ParentSignupRequest):
    existing_user = db.query(User).filter(User.phone == payload.phone).first()
    if existing_user:
        raise ValueError("이미 가입된 전화번호입니다.")

    user_id = str(uuid4())

    new_user = User(
        id=user_id,
        phone=payload.phone,
        name=payload.name,
        birth=payload.birth,
        gender=payload.gender,
        role="elder",
    )
    db.add(new_user)
    db.flush()

    elder_profile = ElderProfile(
        id=str(uuid4()),
        user_id=user_id,
        address=payload.address or "",
        medications="",
        diseases="",
        allergies="",
        hospital="",
        doctor_contact="",
        memo="",
    )
    db.add(elder_profile)

    link_code = _generate_unique_link_code(db)

    guardian_link = GuardianLink(
        id=str(uuid4()),
        elder_user_id=user_id,
        guardian_user_id=None,
        link_code=link_code,
        is_used=False,
    )
    db.add(guardian_link)

    db.commit()
    db.refresh(new_user)

    return {
        "message": "부모님 회원가입이 완료되었습니다.",
        "parent_id": new_user.id,
        "parent_name": new_user.name,
        "link_code": link_code,
    }


def get_parent_by_code(db: Session, link_code: str):
    link = db.query(GuardianLink).filter(GuardianLink.link_code == link_code).first()
    if not link:
        raise ValueError("유효하지 않은 연동 코드입니다.")

    elder_user = db.query(User).filter(User.id == link.elder_user_id).first()
    if not elder_user:
        raise ValueError("부모님 정보를 찾을 수 없습니다.")

    parent_age = calculate_age_from_birth(elder_user.birth)

    return {
        "parent_id": elder_user.id,
        "parent_name": elder_user.name,
        "parent_age": parent_age,
        "parent_gender": elder_user.gender or "",
        "link_code": link.link_code,
        "is_used": link.is_used,
    }


def update_parent_care_info(
    db: Session,
    parent_user_id: str,
    payload: ParentCareInfoUpdateRequest,
):
    elder_profile = (
        db.query(ElderProfile)
        .filter(ElderProfile.user_id == parent_user_id)
        .first()
    )

    if not elder_profile:
        raise ValueError("부모님 프로필을 찾을 수 없습니다.")

    elder_profile.address = payload.address
    elder_profile.medications = payload.medications
    elder_profile.diseases = payload.diseases
    elder_profile.allergies = payload.allergies
    elder_profile.hospital = payload.hospital
    elder_profile.doctor_contact = payload.doctor_contact
    elder_profile.memo = payload.memo

    db.commit()
    db.refresh(elder_profile)

    return {
        "message": "부모님 돌봄 정보가 수정되었습니다.",
        "parent_user_id": parent_user_id,
        "care_info": {
            "address": elder_profile.address,
            "medications": elder_profile.medications,
            "diseases": elder_profile.diseases,
            "allergies": elder_profile.allergies,
            "hospital": elder_profile.hospital,
            "doctor_contact": elder_profile.doctor_contact,
            "memo": elder_profile.memo,
        },
    }