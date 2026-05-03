from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.agent import AgentSlots
from app.schemas.medication import MedicationItem
from app.services.guardian_alert_service import create_guardian_alert, resolve_guardian_alerts


def list_medication_items(db: Session, elder_user_id: str | None = None) -> list[MedicationItem]:
    senior_id = elder_user_id or _get_primary_senior_id(db)
    if not senior_id:
        return []

    rows = db.execute(
        text(
            """
            SELECT
                m.id::text AS id,
                m.name,
                TO_CHAR(m.scheduled_time, 'HH24:MI') AS scheduled_time,
                CASE
                    WHEN latest_log.recorded_at IS NOT NULL THEN latest_log.status
                    ELSE 'scheduled'
                END AS status
                ,
                latest_log.time_scope,
                latest_log.recorded_at,
                latest_log.source
            FROM medications AS m
            LEFT JOIN LATERAL (
                SELECT recorded_at, status, time_scope, source
                FROM medication_logs AS ml
                WHERE ml.senior_user_id = m.senior_user_id
                  AND ml.medication_name = m.name
                  AND DATE(ml.recorded_at AT TIME ZONE 'Asia/Seoul') = DATE(NOW() AT TIME ZONE 'Asia/Seoul')
                ORDER BY ml.recorded_at DESC
                LIMIT 1
            ) AS latest_log ON TRUE
            WHERE m.senior_user_id = :senior_user_id
              AND m.active = TRUE
            ORDER BY m.scheduled_time ASC
            """
        ),
        {"senior_user_id": senior_id},
    ).mappings().all()

    if rows:
        return [
            MedicationItem(
                id=row["id"],
                name=row["name"],
                time=row["scheduled_time"],
                status=row["status"],
                status_label=_format_status_label(row["status"]),
                last_time_scope=row["time_scope"],
                last_recorded_at=row["recorded_at"],
                source=row["source"],
            )
            for row in rows
        ]

    log_rows = db.execute(
        text(
            """
            SELECT medication_name, COALESCE(time_scope, '지금') AS time_scope, status, recorded_at, source
            FROM medication_logs
            WHERE senior_user_id = :senior_user_id
            ORDER BY recorded_at DESC
            LIMIT 5
            """
        ),
        {"senior_user_id": senior_id},
    ).mappings().all()

    if log_rows:
        return [
            MedicationItem(
                id=None,
                name=row["medication_name"],
                time=row["time_scope"],
                status=row["status"],
                status_label=_format_status_label(row["status"]),
                last_time_scope=row["time_scope"],
                last_recorded_at=row["recorded_at"],
                source=row["source"],
            )
            for row in log_rows
        ]

    return []


def record_medication_taken(
    db: Session,
    slots: AgentSlots,
    elder_user_id: str | None = None,
) -> dict[str, str]:
    return record_medication_status(
        db,
        elder_user_id=elder_user_id,
        medication_name=slots.medication_name or "약",
        time_scope=slots.time_scope or "지금",
        status=slots.status or "taken",
        source="agent",
    )


def record_medication_status(
    db: Session,
    *,
    elder_user_id: str | None = None,
    medication_id: str | None = None,
    medication_name: str = "약",
    time_scope: str | None = None,
    status: str = "taken",
    source: str = "mobile",
) -> dict[str, str]:
    senior_id = elder_user_id or _get_primary_senior_id(db)
    resolved_name = medication_name or "약"
    resolved_time_scope = time_scope or "지금"

    if senior_id and medication_id:
        medication_row = db.execute(
            text(
                """
                SELECT name, TO_CHAR(scheduled_time, 'HH24:MI') AS scheduled_time
                FROM medications
                WHERE senior_user_id = :senior_user_id
                  AND id::text = :medication_id
                LIMIT 1
                """
            ),
            {
                "senior_user_id": senior_id,
                "medication_id": medication_id,
            },
        ).mappings().first()

        if medication_row:
            resolved_name = medication_row["name"]
            resolved_time_scope = time_scope or medication_row["scheduled_time"]

    if not senior_id:
        return {
            "medication_name": resolved_name,
            "time_scope": resolved_time_scope,
            "status": status,
            "status_label": _format_status_label(status),
        }

    db.execute(
        text(
            """
            INSERT INTO medication_logs (
                senior_user_id,
                medication_name,
                time_scope,
                status,
                source
            )
            VALUES (
                :senior_user_id,
                :medication_name,
                :time_scope,
                :status,
                :source
            )
            """
        ),
        {
            "senior_user_id": senior_id,
            "medication_name": resolved_name,
            "time_scope": resolved_time_scope,
            "status": status,
            "source": source,
        },
    )

    if status == "missed":
        create_guardian_alert(
            db,
            elder_user_id=senior_id,
            alert_type="medication_missed",
            message=f"{resolved_time_scope} {resolved_name} 복약 누락이 기록되었어요.",
            severity="high",
            dedupe_minutes=180,
        )
    elif status == "taken":
        resolve_guardian_alerts(
            db,
            elder_user_id=senior_id,
            alert_type="medication_missed",
        )
    db.commit()

    return {
        "medication_name": resolved_name,
        "time_scope": resolved_time_scope,
        "status": status,
        "status_label": _format_status_label(status),
    }


def _format_status_label(status: str) -> str:
    return {
        "scheduled": "복용 전",
        "taken": "복용 완료",
        "missed": "복용 누락",
    }.get(status, status)


def _get_primary_senior_id(db: Session) -> str | None:
    row = db.execute(
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
    if not row:
        return None
    return row["id"]
