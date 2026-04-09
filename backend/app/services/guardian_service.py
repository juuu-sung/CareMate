from uuid import uuid4
from datetime import datetime
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.elder_profile import ElderProfile
from app.models.guardian_link import GuardianLink


def calculate_age_from_birth(birth: str | None) -> int | None:
    if not birth:
        return None

    numbers = "".join(ch for ch in birth if ch.isdigit())
    if len(numbers) < 8:
        return None

    try:
        year = int(numbers[0:4])
        month = int(numbers[4:6])
        day = int(numbers[6:8])
        today = datetime.today().date()
        age = today.year - year - ((today.month, today.day) < (month, day))
        return age
    except ValueError:
        return None


def get_parent_by_code(db: Session, link_code: str):
    link = (
        db.query(GuardianLink)
        .filter(GuardianLink.link_code == link_code)
        .first()
    )
    if not link:
        raise ValueError("유효하지 않은 연동 코드입니다.")

    parent_user = db.query(User).filter(User.id == link.elder_user_id).first()
    if not parent_user:
        raise ValueError("부모님 정보를 찾을 수 없습니다.")

    elder_profile = (
        db.query(ElderProfile)
        .filter(ElderProfile.user_id == parent_user.id)
        .first()
    )

    age = calculate_age_from_birth(parent_user.birth)

    return {
        "parent_id": parent_user.id,
        "parent_name": parent_user.name,
        "age": age,
        "phone": parent_user.phone,
        "birth": parent_user.birth,
        "gender": parent_user.gender,
        "link_code": link.link_code,
        "address": elder_profile.address if elder_profile else "",
        "medications": elder_profile.medications if elder_profile else "",
        "diseases": elder_profile.diseases if elder_profile else "",
        "allergies": elder_profile.allergies if elder_profile else "",
        "hospital": elder_profile.hospital if elder_profile else "",
        "doctor_contact": elder_profile.doctor_contact if elder_profile else "",
        "memo": elder_profile.memo if elder_profile else "",
    }


def create_guardian_and_link(db: Session, payload):
    existing_user = db.query(User).filter(User.phone == payload.phone).first()
    if existing_user:
        raise ValueError("이미 가입된 전화번호입니다.")

    link = (
        db.query(GuardianLink)
        .filter(GuardianLink.link_code == payload.link_code)
        .first()
    )
    if not link:
        raise ValueError("유효하지 않은 연동 코드입니다.")

    parent_user = db.query(User).filter(User.id == link.elder_user_id).first()
    if not parent_user:
        raise ValueError("부모님 정보를 찾을 수 없습니다.")

    if link.guardian_user_id is not None:
        raise ValueError("이미 사용된 연동 코드입니다.")

    guardian_user_id = str(uuid4())

    new_user = User(
        id=guardian_user_id,
        name=payload.name,
        phone=payload.phone,
        birth=payload.birth,
        gender=payload.gender,
        role="guardian",
    )
    db.add(new_user)
    db.flush()

    link.guardian_user_id = guardian_user_id

    if hasattr(link, "status"):
        link.status = "connected"

    db.commit()
    db.refresh(new_user)

    return {
        "message": "보호자 회원가입이 완료되었습니다.",
        "guardian_id": guardian_user_id,
        "guardian_name": new_user.name,
        "parent_id": parent_user.id,
        "parent_name": parent_user.name,
        "parent_age": calculate_age_from_birth(parent_user.birth),
        "parent_gender": parent_user.gender,
    }


def update_parent_care_info(db: Session, parent_user_id: str, payload):
    profile = (
        db.query(ElderProfile)
        .filter(ElderProfile.user_id == parent_user_id)
        .first()
    )
    if not profile:
        raise ValueError("어르신 프로필을 찾을 수 없습니다.")

    profile.medications = payload.medications
    profile.diseases = payload.diseases
    profile.allergies = payload.allergies
    profile.hospital = payload.hospital
    profile.doctor_contact = payload.doctor_contact
    profile.memo = payload.memo

    db.commit()
    db.refresh(profile)

    return {
        "elder_id": profile.user_id,
        "medications": profile.medications,
        "diseases": profile.diseases,
        "allergies": profile.allergies,
        "hospital": profile.hospital,
        "doctor_contact": profile.doctor_contact,
        "memo": profile.memo,
    }
