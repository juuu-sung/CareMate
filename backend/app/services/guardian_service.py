from datetime import datetime
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.elder_profile import ElderProfile
from app.models.guardian_link import GuardianLink
from app.schemas.alerts import AlertItem
from app.schemas.guardian import GuardianLoginRequest
from app.services.chat_log_service import list_chat_logs_for_elder


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


def _normalize_phone(value: str | None) -> str:
    if not value:
        return ""
    digits = "".join(ch for ch in value if ch.isdigit())
    return digits or value.strip()


def _normalize_birth(value: str | None) -> str:
    if not value:
        return ""
    return "".join(ch for ch in value if ch.isdigit())


def _find_guardian_user(db: Session, payload: GuardianLoginRequest) -> User | None:
    normalized_phone = _normalize_phone(payload.phone)
    normalized_birth = _normalize_birth(payload.birth)

    users = db.query(User).filter(User.role == "guardian").all()
    for user in users:
        if (
            _normalize_phone(user.phone) == normalized_phone
            and _normalize_birth(user.birth) == normalized_birth
        ):
            return user

    return None


def _get_guardian_link(db: Session, elder_user_id: str, link_code: str) -> GuardianLink:
    link = (
        db.query(GuardianLink)
        .filter(
            GuardianLink.link_code == link_code,
            GuardianLink.elder_user_id == elder_user_id,
        )
        .first()
    )

    if not link or not link.guardian_user_id:
        raise ValueError("연동된 보호자 정보를 찾을 수 없습니다.")

    return link


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


def get_guardian_dashboard(db: Session, elder_user_id: str, link_code: str):
    _get_guardian_link(db, elder_user_id=elder_user_id, link_code=link_code)

    care_profile = db.execute(
        text(
            """
            SELECT mode
            FROM care_profiles
            WHERE senior_user_id = :elder_user_id
            LIMIT 1
            """
        ),
        {"elder_user_id": elder_user_id},
    ).mappings().first()

    latest_location = db.execute(
        text(
            """
            SELECT captured_at
            FROM locations
            WHERE senior_user_id = :elder_user_id
            ORDER BY captured_at DESC
            LIMIT 1
            """
        ),
        {"elder_user_id": elder_user_id},
    ).mappings().first()

    alert_row = db.execute(
        text(
            """
            SELECT COUNT(*) AS open_alert_count
            FROM alerts
            WHERE senior_user_id = :elder_user_id
              AND status = 'open'
              AND type <> 'location_request'
            """
        ),
        {"elder_user_id": elder_user_id},
    ).mappings().one()

    medication_row = db.execute(
        text(
            """
            SELECT COUNT(*) AS pending_count
            FROM medications AS m
            LEFT JOIN LATERAL (
                SELECT status
                FROM medication_logs AS ml
                WHERE ml.senior_user_id = m.senior_user_id
                  AND ml.medication_name = m.name
                  AND DATE(ml.recorded_at AT TIME ZONE 'Asia/Seoul') = CURRENT_DATE
                ORDER BY ml.recorded_at DESC
                LIMIT 1
            ) AS latest_log ON TRUE
            WHERE m.senior_user_id = :elder_user_id
              AND m.active = TRUE
              AND COALESCE(latest_log.status, 'scheduled') <> 'taken'
            """
        ),
        {"elder_user_id": elder_user_id},
    ).mappings().one()

    schedule_row = db.execute(
        text(
            """
            SELECT COUNT(*) AS today_schedule_count
            FROM schedules
            WHERE senior_user_id = :elder_user_id
              AND DATE(scheduled_at AT TIME ZONE 'Asia/Seoul') = CURRENT_DATE
            """
        ),
        {"elder_user_id": elder_user_id},
    ).mappings().one()

    check_in_row = db.execute(
        text(
            """
            SELECT status
            FROM check_ins
            WHERE senior_user_id = :elder_user_id
            ORDER BY requested_at DESC
            LIMIT 1
            """
        ),
        {"elder_user_id": elder_user_id},
    ).mappings().first()

    latest_location_captured_at = ""
    latest_location_status = "unavailable"
    latest_location_label = "위치 기록 없음"

    if latest_location and latest_location["captured_at"]:
        latest_location_status = "available"
        latest_location_label = "확인 가능"
        latest_location_captured_at = latest_location["captured_at"].isoformat()

    return {
        "care_mode": care_profile["mode"] if care_profile else "basic",
        "check_in_status": check_in_row["status"] if check_in_row else "responded",
        "latest_location_status": latest_location_status,
        "latest_location_label": latest_location_label,
        "latest_location_captured_at": latest_location_captured_at,
        "open_alert_count": int(alert_row["open_alert_count"] or 0),
        "today_medication_pending_count": int(medication_row["pending_count"] or 0),
        "today_schedule_count": int(schedule_row["today_schedule_count"] or 0),
    }


def list_guardian_alerts(
    db: Session,
    elder_user_id: str,
    link_code: str,
    limit: int = 3,
) -> list[AlertItem]:
    _get_guardian_link(db, elder_user_id=elder_user_id, link_code=link_code)

    rows = db.execute(
        text(
            """
            SELECT type, message, created_at
            FROM alerts
            WHERE senior_user_id = :elder_user_id
              AND type <> 'location_request'
            ORDER BY created_at DESC
            LIMIT :limit
            """
        ),
        {"elder_user_id": elder_user_id, "limit": limit},
    ).mappings().all()

    return [
        AlertItem(
            type=row["type"],
            message=row["message"],
            created_at=row["created_at"].isoformat() if row["created_at"] else "",
        )
        for row in rows
    ]


def list_guardian_conversations(
    db: Session,
    elder_user_id: str,
    link_code: str,
    limit: int = 30,
) -> list[dict[str, str]]:
    _get_guardian_link(db, elder_user_id=elder_user_id, link_code=link_code)
    return list_chat_logs_for_elder(
        db,
        senior_user_id=elder_user_id,
        limit=limit,
    )


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
    link.is_used = True

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


def login_guardian(db: Session, payload: GuardianLoginRequest):
    guardian_user = _find_guardian_user(db, payload)
    if not guardian_user:
        raise ValueError("전화번호 또는 생년월일이 올바르지 않습니다.")

    link = (
        db.query(GuardianLink)
        .filter(GuardianLink.guardian_user_id == guardian_user.id)
        .order_by(GuardianLink.created_at.desc())
        .first()
    )
    if not link:
        raise ValueError("연동된 부모님 정보를 찾을 수 없습니다.")

    parent_user = db.query(User).filter(User.id == link.elder_user_id).first()
    if not parent_user:
        raise ValueError("부모님 정보를 찾을 수 없습니다.")

    elder_profile = (
        db.query(ElderProfile)
        .filter(ElderProfile.user_id == parent_user.id)
        .first()
    )

    return {
        "message": "보호자 로그인이 완료되었습니다.",
        "guardian_id": guardian_user.id,
        "guardian_name": guardian_user.name,
        "parent_id": parent_user.id,
        "parent_name": parent_user.name,
        "parent_age": calculate_age_from_birth(parent_user.birth),
        "parent_gender": parent_user.gender,
        "link_code": link.link_code,
        "medications": elder_profile.medications if elder_profile else "",
        "diseases": elder_profile.diseases if elder_profile else "",
        "allergies": elder_profile.allergies if elder_profile else "",
        "hospital": elder_profile.hospital if elder_profile else "",
        "doctor_contact": elder_profile.doctor_contact if elder_profile else "",
        "memo": elder_profile.memo if elder_profile else "",
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
