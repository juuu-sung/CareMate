from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.guardian_alert_service import create_guardian_alert


SEOUL_TZ = ZoneInfo("Asia/Seoul")


def sweep_time_based_alerts(db: Session) -> dict[str, int]:
    created_counts = {
        "medication_missed": _sweep_missed_medications(db),
        "location_stale": _sweep_stale_locations(db),
        "check_in_missed": _sweep_missed_check_ins(db),
    }
    db.commit()
    return {
        "created_count": sum(created_counts.values()),
        **created_counts,
    }


def _sweep_missed_medications(db: Session) -> int:
    now_local = datetime.now(SEOUL_TZ)
    now_minutes = now_local.hour * 60 + now_local.minute
    created_count = 0

    rows = db.execute(
        text(
            """
            SELECT
                m.senior_user_id,
                m.name,
                m.scheduled_time,
                latest_log.status
            FROM medications AS m
            LEFT JOIN LATERAL (
                SELECT status
                FROM medication_logs AS ml
                WHERE ml.senior_user_id = m.senior_user_id
                  AND ml.medication_name = m.name
                  AND DATE(ml.recorded_at AT TIME ZONE 'Asia/Seoul') = DATE(NOW() AT TIME ZONE 'Asia/Seoul')
                ORDER BY ml.recorded_at DESC
                LIMIT 1
            ) AS latest_log ON TRUE
            WHERE m.active = TRUE
            """
        )
    ).mappings().all()

    for row in rows:
        status = row["status"] or "scheduled"
        scheduled_time = row["scheduled_time"]

        if status in {"taken", "missed"} or not scheduled_time:
            continue

        scheduled_minutes = scheduled_time.hour * 60 + scheduled_time.minute
        delay_minutes = now_minutes - scheduled_minutes

        if delay_minutes < 60:
            continue

        severity = "high" if delay_minutes >= 120 else "medium"
        created = create_guardian_alert(
            db,
            elder_user_id=row["senior_user_id"],
            alert_type="medication_missed",
            message=f"{scheduled_time.strftime('%H:%M')} {row['name']} 복약 확인이 필요해요.",
            severity=severity,
            dedupe_minutes=240,
        )
        created_count += int(created)

    return created_count


def _sweep_stale_locations(db: Session) -> int:
    now = datetime.now(timezone.utc)
    created_count = 0

    rows = db.execute(
        text(
            """
            SELECT
                cp.senior_user_id,
                latest_location.captured_at
            FROM care_profiles AS cp
            LEFT JOIN LATERAL (
                SELECT captured_at
                FROM locations AS l
                WHERE l.senior_user_id = cp.senior_user_id
                ORDER BY captured_at DESC
                LIMIT 1
            ) AS latest_location ON TRUE
            WHERE cp.always_on_location_enabled = TRUE
            """
        )
    ).mappings().all()

    for row in rows:
        captured_at = row["captured_at"]

        if captured_at:
            stale_minutes = int((now - captured_at).total_seconds() // 60)
            if stale_minutes < 12 * 60:
                continue
            severity = "high" if stale_minutes >= 24 * 60 else "medium"
            message = "부모님 위치가 24시간 이상 갱신되지 않았어요." if severity == "high" else "부모님 위치가 12시간 이상 갱신되지 않았어요."
        else:
            severity = "medium"
            message = "부모님 위치 기록이 아직 없습니다."

        created = create_guardian_alert(
            db,
            elder_user_id=row["senior_user_id"],
            alert_type="location_stale",
            message=message,
            severity=severity,
            dedupe_minutes=720,
        )
        created_count += int(created)

    return created_count


def _sweep_missed_check_ins(db: Session) -> int:
    now = datetime.now(timezone.utc)
    created_count = 0

    rows = db.execute(
        text(
            """
            SELECT
                ci.id::text AS id,
                ci.senior_user_id,
                ci.requested_at,
                COALESCE(cp.check_in_interval_minutes, 180) AS check_in_interval_minutes
            FROM check_ins AS ci
            LEFT JOIN care_profiles AS cp
              ON cp.senior_user_id = ci.senior_user_id
            WHERE ci.status = 'pending'
            """
        )
    ).mappings().all()

    for row in rows:
        requested_at = row["requested_at"]
        if not requested_at:
            continue

        elapsed_minutes = int((now - requested_at).total_seconds() // 60)
        threshold_minutes = max(30, int(row["check_in_interval_minutes"] or 180))

        if elapsed_minutes < threshold_minutes:
            continue

        db.execute(
            text(
                """
                UPDATE check_ins
                SET status = 'missed'
                WHERE id::text = :check_in_id
                  AND status = 'pending'
                """
            ),
            {"check_in_id": row["id"]},
        )

        created = create_guardian_alert(
            db,
            elder_user_id=row["senior_user_id"],
            alert_type="check_in_missed",
            message="안부 확인 요청에 아직 응답이 없어요.",
            severity="high",
            dedupe_minutes=240,
        )
        created_count += int(created)

    return created_count
