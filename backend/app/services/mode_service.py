from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.modes import CareModeResponse, CareModeUpdateRequest, GuardianOptions


def get_current_mode(db: Session, elder_user_id: str | None = None) -> CareModeResponse:
    senior_id = elder_user_id or _get_primary_senior_id(db)

    if not senior_id:
        return CareModeResponse(mode="basic", options=GuardianOptions())

    care_profile = db.execute(
        text(
            """
            SELECT mode, check_in_interval_minutes, alert_repeat_count, always_on_location_enabled
            FROM care_profiles
            WHERE senior_user_id = :senior_user_id
            LIMIT 1
            """
        ),
        {"senior_user_id": senior_id},
    ).mappings().first()

    if not care_profile:
        return CareModeResponse(mode="basic", options=GuardianOptions())

    return CareModeResponse(
        mode=care_profile["mode"],
        options=GuardianOptions(
            check_in_interval_minutes=care_profile["check_in_interval_minutes"],
            alert_repeat_count=care_profile["alert_repeat_count"],
            always_on_location_enabled=care_profile["always_on_location_enabled"],
        ),
    )


def update_mode(
    db: Session,
    payload: CareModeUpdateRequest,
    elder_user_id: str | None = None,
) -> CareModeResponse:
    senior_id = elder_user_id or _get_primary_senior_id(db)

    if not senior_id:
        raise ValueError("No senior user found for care profile update.")

    db.execute(
        text(
            """
            INSERT INTO care_profiles (
                id,
                senior_user_id,
                mode,
                check_in_interval_minutes,
                alert_repeat_count,
                always_on_location_enabled
            )
            VALUES (
                gen_random_uuid(),
                :senior_user_id,
                :mode,
                :check_in_interval_minutes,
                :alert_repeat_count,
                :always_on_location_enabled
            )
            ON CONFLICT (senior_user_id)
            DO UPDATE SET
                mode = EXCLUDED.mode,
                check_in_interval_minutes = EXCLUDED.check_in_interval_minutes,
                alert_repeat_count = EXCLUDED.alert_repeat_count,
                always_on_location_enabled = EXCLUDED.always_on_location_enabled,
                updated_at = NOW()
            """
        ),
        {
            "senior_user_id": senior_id,
            "mode": payload.mode,
            "check_in_interval_minutes": payload.options.check_in_interval_minutes,
            "alert_repeat_count": payload.options.alert_repeat_count,
            "always_on_location_enabled": payload.options.always_on_location_enabled,
        },
    )
    db.commit()

    return get_current_mode(db, elder_user_id=senior_id)


def change_mode_from_agent(
    db: Session,
    mode: str,
    elder_user_id: str | None = None,
) -> CareModeResponse:
    current = get_current_mode(db, elder_user_id=elder_user_id)
    payload = CareModeUpdateRequest(mode=mode, options=current.options)
    return update_mode(db, payload, elder_user_id=elder_user_id)


def _get_primary_senior_id(db: Session):
    senior = db.execute(
        text(
            """
            SELECT id
            FROM users
            WHERE role = 'elder'
            ORDER BY created_at ASC
            LIMIT 1
            """
        )
    ).mappings().first()
    return senior["id"] if senior else None
