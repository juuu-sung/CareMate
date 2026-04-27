from uuid import uuid4
from datetime import datetime
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.models.user import User
from app.models.elder_profile import ElderProfile
from app.models.guardian_link import GuardianLink
from app.models.care_document import CareDocument

from app.rules.code_generator import generate_link_code
from app.schemas.parent import (
    ParentCareInfoUpdateRequest,
    ParentLoginRequest,
    ParentSignupRequest,
)
from app.services.file_upload import save_upload_file
from app.services.gpt_summary import summarize_medical_image


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


def _normalize_phone(value: str | None) -> str:
    if not value:
        return ""

    digits = "".join(ch for ch in value if ch.isdigit())
    return digits or value.strip()


def _normalize_birth(value: str | None) -> str:
    if not value:
        return ""

    return "".join(ch for ch in value if ch.isdigit())


def _find_parent_user(db: Session, payload: ParentLoginRequest) -> User | None:
    normalized_phone = _normalize_phone(payload.phone)
    normalized_birth = _normalize_birth(payload.birth)

    users = db.query(User).filter(User.role == "elder").all()

    for user in users:
        if (
            _normalize_phone(user.phone) == normalized_phone
            and _normalize_birth(user.birth) == normalized_birth
        ):
            return user

    return None


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


def login_parent(db: Session, payload: ParentLoginRequest):
    parent_user = _find_parent_user(db, payload)

    if not parent_user:
        raise ValueError("전화번호 또는 생년월일이 올바르지 않습니다.")

    link = (
        db.query(GuardianLink)
        .filter(GuardianLink.elder_user_id == parent_user.id)
        .order_by(GuardianLink.created_at.desc())
        .first()
    )

    if not link:
        raise ValueError("연동 코드를 찾을 수 없습니다.")

    guardian_phone = ""

    if link.guardian_user_id:
        guardian_user = db.query(User).filter(User.id == link.guardian_user_id).first()
        if guardian_user and guardian_user.phone:
            guardian_phone = guardian_user.phone

    return {
        "message": "부모님 로그인이 완료되었습니다.",
        "parent_id": parent_user.id,
        "parent_name": parent_user.name,
        "link_code": link.link_code,
        "guardian_phone": guardian_phone,
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

    elder_profile.address = payload.address or ""
    elder_profile.medications = payload.medications or ""
    elder_profile.diseases = payload.diseases or ""
    elder_profile.allergies = payload.allergies or ""
    elder_profile.hospital = payload.hospital or ""
    elder_profile.doctor_contact = payload.doctor_contact or ""
    elder_profile.memo = payload.memo or ""

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


def merge_summaries(base_text: str, title: str, summaries: list[str]) -> str:
    base_text = (base_text or "").strip()

    valid_summaries = [
        str(summary).strip()
        for summary in summaries
        if summary and str(summary).strip()
    ]

    if not valid_summaries:
        return base_text

    summary_text = "\n\n".join(
        [
            f"[{title} 요약 {index + 1}]\n{summary}"
            for index, summary in enumerate(valid_summaries)
        ]
    )

    if base_text:
        return f"{base_text}\n\n{summary_text}"

    return summary_text


async def _save_and_summarize_document(
    db: Session,
    image,
    folder_name: str,
    document_type: str,
    summary_title: str,
    parent_user_id: str,
) -> str:
    image_path = await save_upload_file(image, folder_name)

    try:
        summary = await run_in_threadpool(
            summarize_medical_image,
            image_path,
            summary_title,
        )

        if not summary or not str(summary).strip():
            summary = f"{summary_title} 이미지에서 내용을 인식하지 못했습니다."

    except Exception as e:
        print("summarize_medical_image error:", repr(e))
        summary = f"{summary_title} 이미지가 저장되었습니다. 요약은 나중에 다시 생성해야 합니다."

    db.add(
        CareDocument(
            id=str(uuid4()),
            elder_user_id=parent_user_id,
            document_type=document_type,
            image_path=image_path,
            summary=summary or "",
        )
    )

    return summary or ""


async def update_parent_care_info_with_images(
    db: Session,
    parent_user_id: str,
    medications: str,
    diseases: str,
    allergies: str,
    hospital: str,
    doctor_contact: str,
    memo: str,
    prescription_images,
    disease_document_images,
    allergy_document_images,
):
    profile = (
        db.query(ElderProfile)
        .filter(ElderProfile.user_id == parent_user_id)
        .first()
    )

    if not profile:
        raise ValueError("부모님 프로필을 찾을 수 없습니다.")

    prescription_summaries: list[str] = []
    disease_summaries: list[str] = []
    allergy_summaries: list[str] = []

    try:
        for image in prescription_images or []:
            summary = await _save_and_summarize_document(
                db=db,
                image=image,
                folder_name="prescriptions",
                document_type="prescription",
                summary_title="처방전",
                parent_user_id=parent_user_id,
            )
            prescription_summaries.append(summary)

        for image in disease_document_images or []:
            summary = await _save_and_summarize_document(
                db=db,
                image=image,
                folder_name="disease_documents",
                document_type="disease",
                summary_title="진단서",
                parent_user_id=parent_user_id,
            )
            disease_summaries.append(summary)

        for image in allergy_document_images or []:
            summary = await _save_and_summarize_document(
                db=db,
                image=image,
                folder_name="allergy_documents",
                document_type="allergy",
                summary_title="알레르기 관련 진단서",
                parent_user_id=parent_user_id,
            )
            allergy_summaries.append(summary)

        profile.medications = merge_summaries(
            medications,
            "처방전",
            prescription_summaries,
        )

        profile.diseases = merge_summaries(
            diseases,
            "진단서",
            disease_summaries,
        )

        profile.allergies = merge_summaries(
            allergies,
            "알레르기 문서",
            allergy_summaries,
        )

        profile.hospital = hospital or ""
        profile.doctor_contact = doctor_contact or ""
        profile.memo = memo or ""

        db.commit()
        db.refresh(profile)

        return {
            "message": "건강정보와 문서 요약이 저장되었습니다.",
            "medications": profile.medications or "",
            "diseases": profile.diseases or "",
            "allergies": profile.allergies or "",
            "hospital": profile.hospital or "",
            "doctor_contact": profile.doctor_contact or "",
            "memo": profile.memo or "",
        }

    except Exception as e:
        db.rollback()
        print("update_parent_care_info_with_images error:", repr(e))
        raise