from sqlalchemy import text

from app.core.database import SessionLocal

SENIOR_ID = "11111111-1111-1111-1111-111111111111"
GUARDIAN_ID = "22222222-2222-2222-2222-222222222222"
CARE_PROFILE_ID = "33333333-3333-3333-3333-333333333333"
GUARDIAN_LINK_ID = "44444444-4444-4444-4444-444444444444"
MEDICATION_ID = "55555555-5555-5555-5555-555555555555"
SCHEDULE_ID = "66666666-6666-6666-6666-666666666666"
CHECKIN_ID = "77777777-7777-7777-7777-777777777777"
ALERT_ID = "88888888-8888-8888-8888-888888888888"
LOCATION_ID = "99999999-9999-9999-9999-999999999999"


def main() -> None:
    db = SessionLocal()
    try:
        db.execute(
            text(
                """
                INSERT INTO users (id, role, name, phone, birth_date)
                VALUES
                    (:senior_id, 'senior', '김영자', '010-0000-0001', '1945-05-15'),
                    (:guardian_id, 'guardian', '이보호', '010-0000-0002', '1985-03-20')
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"senior_id": SENIOR_ID, "guardian_id": GUARDIAN_ID},
        )

        db.execute(
            text(
                """
                INSERT INTO guardian_links (id, senior_user_id, guardian_user_id, relationship_label, is_primary)
                VALUES (:id, :senior_user_id, :guardian_user_id, 'daughter', TRUE)
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"id": GUARDIAN_LINK_ID, "senior_user_id": SENIOR_ID, "guardian_user_id": GUARDIAN_ID},
        )

        db.execute(
            text(
                """
                INSERT INTO care_profiles (id, senior_user_id, mode, check_in_interval_minutes, alert_repeat_count, always_on_location_enabled)
                VALUES (:id, :senior_user_id, 'basic', 180, 3, TRUE)
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"id": CARE_PROFILE_ID, "senior_user_id": SENIOR_ID},
        )

        db.execute(
            text(
                """
                INSERT INTO medications (id, senior_user_id, name, dosage_note, scheduled_time, repeat_daily, active)
                VALUES (:id, :senior_user_id, '혈압약', '식후 1정', '08:00', TRUE, TRUE)
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"id": MEDICATION_ID, "senior_user_id": SENIOR_ID},
        )

        db.execute(
            text(
                """
                INSERT INTO schedules (id, senior_user_id, title, description, scheduled_at, type, status)
                VALUES (
                    :id,
                    :senior_user_id,
                    '주민센터 방문',
                    '복지 서비스 상담',
                    NOW() + INTERVAL '2 hour',
                    'welfare',
                    'scheduled'
                )
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"id": SCHEDULE_ID, "senior_user_id": SENIOR_ID},
        )

        db.execute(
            text(
                """
                INSERT INTO check_ins (id, senior_user_id, requested_at, responded_at, status)
                VALUES (:id, :senior_user_id, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '55 minute', 'responded')
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"id": CHECKIN_ID, "senior_user_id": SENIOR_ID},
        )

        db.execute(
            text(
                """
                INSERT INTO alerts (id, senior_user_id, type, severity, message, status)
                VALUES (:id, :senior_user_id, 'medication_missed', 'medium', '복약 알림 3회 미응답', 'open')
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"id": ALERT_ID, "senior_user_id": SENIOR_ID},
        )

        db.execute(
            text(
                """
                INSERT INTO locations (id, senior_user_id, latitude, longitude, source, captured_at)
                VALUES (:id, :senior_user_id, 37.5665, 126.9780, 'mobile', NOW() - INTERVAL '10 minute')
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"id": LOCATION_ID, "senior_user_id": SENIOR_ID},
        )

        db.commit()
        print("Seed data inserted.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
