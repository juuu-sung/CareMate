from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.agent import AgentSlots
from app.schemas.medication import (
    MedicationAdherenceAnalytics,
    MedicationAnalyticsRange,
    MedicationAnalyticsResponse,
    MedicationAnalyticsSummary,
    MedicationDailyAnalytics,
    MedicationItem,
    MedicationMissedHistoryItem,
    MedicationScheduleGridCell,
    MedicationScheduleGridRow,
    MedicationTimeSlotAnalytics,
)
from app.services.guardian_alert_service import create_guardian_alert, resolve_guardian_alerts

SEOUL_TZ = timezone(timedelta(hours=9))


def list_medication_items(db: Session, elder_user_id: str | None = None) -> list[MedicationItem]:
    senior_id = elder_user_id or _get_primary_senior_id(db)
    if not senior_id:
        return []

    rows = db.execute(
        text(
            """
            WITH active_medications AS (
                SELECT
                    id::text AS id,
                    senior_user_id,
                    name,
                    easy_name,
                    scheduled_time,
                    TO_CHAR(scheduled_time, 'HH24:MI') AS scheduled_time_text,
                    COUNT(*) OVER (PARTITION BY senior_user_id, name) AS dose_count
                FROM medications
                WHERE senior_user_id = :senior_user_id
                  AND active = TRUE
            )
            SELECT
                m.id,
                m.name,
                m.easy_name,
                m.scheduled_time_text AS scheduled_time,
                CASE
                    WHEN latest_log.recorded_at IS NOT NULL THEN latest_log.status
                    ELSE 'scheduled'
                END AS status,
                latest_log.time_scope,
                latest_log.recorded_at,
                latest_log.source
            FROM active_medications AS m
            LEFT JOIN LATERAL (
                SELECT recorded_at, status, time_scope, source
                FROM medication_logs AS ml
                WHERE ml.senior_user_id = m.senior_user_id
                  AND ml.medication_name = m.name
                  AND DATE(ml.recorded_at AT TIME ZONE 'Asia/Seoul') = DATE(NOW() AT TIME ZONE 'Asia/Seoul')
                  AND (
                    ml.time_scope = m.scheduled_time_text
                    OR (
                        m.dose_count = 1
                        AND COALESCE(ml.time_scope, '') IN ('', '지금', '오늘')
                    )
                  )
                ORDER BY
                    CASE WHEN ml.time_scope = m.scheduled_time_text THEN 0 ELSE 1 END,
                    ml.recorded_at DESC
                LIMIT 1
            ) AS latest_log ON TRUE
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
                easy_name=row["easy_name"],
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
                easy_name=None,
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


def get_medication_analytics(
    db: Session,
    elder_user_id: str | None = None,
    days: int = 7,
) -> MedicationAnalyticsResponse:
    senior_id = elder_user_id or _get_primary_senior_id(db)
    normalized_days = max(1, min(days, 31))
    today = datetime.now(SEOUL_TZ).date()
    start_date = today - timedelta(days=normalized_days - 1)

    if not senior_id:
        return _empty_medication_analytics(normalized_days, start_date, today)

    rows = db.execute(
        text(
            """
            WITH bounds AS (
                SELECT
                    (DATE(NOW() AT TIME ZONE 'Asia/Seoul') - ((CAST(:days AS INTEGER) - 1) * INTERVAL '1 day'))::date AS start_date,
                    DATE(NOW() AT TIME ZONE 'Asia/Seoul') AS end_date
            ),
            dates AS (
                SELECT generate_series(start_date, end_date, INTERVAL '1 day')::date AS date_key
                FROM bounds
            ),
            active_medications AS (
                SELECT
                    id::text AS medication_id,
                    senior_user_id,
                    name,
                    easy_name,
                    scheduled_time,
                    TO_CHAR(scheduled_time, 'HH24:MI') AS scheduled_time_text,
                    COUNT(*) OVER (PARTITION BY senior_user_id, name) AS dose_count
                FROM medications
                WHERE senior_user_id = :senior_user_id
                  AND active = TRUE
            )
            SELECT
                d.date_key,
                m.medication_id,
                m.name,
                m.easy_name,
                m.scheduled_time,
                m.scheduled_time_text,
                latest_log.status,
                latest_log.recorded_at,
                latest_log.source
            FROM dates AS d
            CROSS JOIN active_medications AS m
            LEFT JOIN LATERAL (
                SELECT status, recorded_at, source, time_scope
                FROM medication_logs AS ml
                WHERE ml.senior_user_id = :senior_user_id
                  AND ml.medication_name = m.name
                  AND DATE(ml.recorded_at AT TIME ZONE 'Asia/Seoul') = d.date_key
                  AND (
                    ml.time_scope = m.scheduled_time_text
                    OR (
                        m.dose_count = 1
                        AND COALESCE(ml.time_scope, '') IN ('', '지금', '오늘')
                    )
                  )
                ORDER BY
                    CASE WHEN ml.time_scope = m.scheduled_time_text THEN 0 ELSE 1 END,
                    ml.recorded_at DESC
                LIMIT 1
            ) AS latest_log ON TRUE
            ORDER BY d.date_key ASC, m.scheduled_time ASC, m.name ASC
            """
        ),
        {
            "senior_user_id": senior_id,
            "days": normalized_days,
        },
    ).mappings().all()

    return _build_medication_analytics_response(
        rows,
        days=normalized_days,
        start_date=start_date,
        end_date=today,
    )


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


def _empty_medication_analytics(
    days: int,
    start_date: date,
    end_date: date,
) -> MedicationAnalyticsResponse:
    daily = [
        MedicationDailyAnalytics(
            date=(start_date + timedelta(days=index)).isoformat(),
            expected_count=0,
            taken_count=0,
            missed_count=0,
            pending_count=0,
            completion_rate=0,
        )
        for index in range(days)
    ]

    return MedicationAnalyticsResponse(
        range=MedicationAnalyticsRange(
            days=days,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
        ),
        summary=MedicationAnalyticsSummary(
            expected_count=0,
            taken_count=0,
            missed_count=0,
            pending_count=0,
            completion_rate=0,
            missed_rate=0,
            current_missed_streak=0,
            longest_missed_streak=0,
        ),
        daily=daily,
        time_slots=_empty_time_slots(),
        medications=[],
        schedule_grid=[],
        recent_missed=[],
    )


def _build_medication_analytics_response(
    rows,
    *,
    days: int,
    start_date: date,
    end_date: date,
) -> MedicationAnalyticsResponse:
    today = datetime.now(SEOUL_TZ).date()
    now_local = datetime.now(SEOUL_TZ)
    now_minutes = now_local.hour * 60 + now_local.minute

    enriched_rows = []
    for row in rows:
        row_date = row["date_key"]
        scheduled_time = row["scheduled_time"]
        status = _resolve_analytics_status(
            logged_status=row["status"],
            row_date=row_date,
            scheduled_time=scheduled_time,
            today=today,
            now_minutes=now_minutes,
        )
        is_expected = _is_expected_dose(
            logged_status=row["status"],
            row_date=row_date,
            scheduled_time=scheduled_time,
            today=today,
            now_minutes=now_minutes,
        )

        enriched_rows.append(
            {
                "date": row_date,
                "medication_id": row["medication_id"],
                "name": row["name"],
                "easy_name": row["easy_name"],
                "scheduled_time": row["scheduled_time_text"],
                "scheduled_time_value": scheduled_time,
                "status": status,
                "is_expected": is_expected,
                "recorded_at": row["recorded_at"],
            }
        )

    daily = _build_daily_analytics(enriched_rows, start_date, days)
    summary = _build_summary_analytics(enriched_rows)
    time_slots = _build_time_slot_analytics(enriched_rows)
    medications = _build_medication_adherence_analytics(enriched_rows)
    schedule_grid = _build_schedule_grid(enriched_rows, start_date, days)
    recent_missed = _build_recent_missed_history(enriched_rows)

    return MedicationAnalyticsResponse(
        range=MedicationAnalyticsRange(
            days=days,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
        ),
        summary=summary,
        daily=daily,
        time_slots=time_slots,
        medications=medications,
        schedule_grid=schedule_grid,
        recent_missed=recent_missed,
    )


def _resolve_analytics_status(
    *,
    logged_status: str | None,
    row_date: date,
    scheduled_time: time | None,
    today: date,
    now_minutes: int,
) -> str:
    if logged_status in {"taken", "missed"}:
        return logged_status

    if not _is_dose_due(row_date, scheduled_time, today, now_minutes):
        return "scheduled"

    if row_date < today:
        return "missed"

    return "pending"


def _is_expected_dose(
    *,
    logged_status: str | None,
    row_date: date,
    scheduled_time: time | None,
    today: date,
    now_minutes: int,
) -> bool:
    if logged_status in {"taken", "missed"}:
        return True

    return _is_dose_due(row_date, scheduled_time, today, now_minutes)


def _is_dose_due(
    row_date: date,
    scheduled_time: time | None,
    today: date,
    now_minutes: int,
) -> bool:
    if row_date < today:
        return True

    if row_date > today or not scheduled_time:
        return False

    scheduled_minutes = scheduled_time.hour * 60 + scheduled_time.minute
    return scheduled_minutes <= now_minutes


def _build_daily_analytics(
    rows: list[dict],
    start_date: date,
    days: int,
) -> list[MedicationDailyAnalytics]:
    daily_stats = {
        (start_date + timedelta(days=index)): {
            "expected_count": 0,
            "taken_count": 0,
            "missed_count": 0,
            "pending_count": 0,
        }
        for index in range(days)
    }

    for row in rows:
        stats = daily_stats[row["date"]]
        if row["is_expected"]:
            stats["expected_count"] += 1
        if row["status"] == "taken":
            stats["taken_count"] += 1
        elif row["status"] == "missed":
            stats["missed_count"] += 1
        elif row["status"] == "pending":
            stats["pending_count"] += 1

    return [
        MedicationDailyAnalytics(
            date=day.isoformat(),
            expected_count=stats["expected_count"],
            taken_count=stats["taken_count"],
            missed_count=stats["missed_count"],
            pending_count=stats["pending_count"],
            completion_rate=_rate(stats["taken_count"], stats["expected_count"]),
        )
        for day, stats in sorted(daily_stats.items())
    ]


def _build_summary_analytics(rows: list[dict]) -> MedicationAnalyticsSummary:
    expected_count = sum(1 for row in rows if row["is_expected"])
    taken_count = sum(1 for row in rows if row["status"] == "taken")
    missed_count = sum(1 for row in rows if row["status"] == "missed")
    pending_count = sum(1 for row in rows if row["status"] == "pending")

    return MedicationAnalyticsSummary(
        expected_count=expected_count,
        taken_count=taken_count,
        missed_count=missed_count,
        pending_count=pending_count,
        completion_rate=_rate(taken_count, expected_count),
        missed_rate=_rate(missed_count, expected_count),
        current_missed_streak=_current_missed_streak(rows),
        longest_missed_streak=_longest_missed_streak(rows),
    )


def _build_time_slot_analytics(rows: list[dict]) -> list[MedicationTimeSlotAnalytics]:
    stats_by_slot = {
        slot: {"label": label, "expected_count": 0, "missed_count": 0}
        for slot, label in _slot_labels().items()
    }

    for row in rows:
        slot = _time_slot_for(row["scheduled_time_value"])
        stats = stats_by_slot[slot]
        if row["is_expected"]:
            stats["expected_count"] += 1
        if row["status"] == "missed":
            stats["missed_count"] += 1

    return [
        MedicationTimeSlotAnalytics(
            slot=slot,
            label=stats["label"],
            expected_count=stats["expected_count"],
            missed_count=stats["missed_count"],
            missed_rate=_rate(stats["missed_count"], stats["expected_count"]),
        )
        for slot, stats in stats_by_slot.items()
    ]


def _build_medication_adherence_analytics(rows: list[dict]) -> list[MedicationAdherenceAnalytics]:
    rows_by_medication = defaultdict(list)

    for row in rows:
        key = _medication_name_key(row["name"])
        rows_by_medication[key].append(row)

    analytics = []
    for medication_rows in rows_by_medication.values():
        sorted_rows = sorted(
            medication_rows,
            key=lambda row: (row["date"], row["scheduled_time"]),
        )
        expected_count = sum(1 for row in sorted_rows if row["is_expected"])
        taken_count = sum(1 for row in sorted_rows if row["status"] == "taken")
        missed_count = sum(1 for row in sorted_rows if row["status"] == "missed")
        latest_row = sorted_rows[-1]
        scheduled_times = sorted(
            {
                row["scheduled_time"]
                for row in sorted_rows
                if row["scheduled_time"]
            }
        )

        analytics.append(
            MedicationAdherenceAnalytics(
                medication_id=latest_row["medication_id"],
                name=latest_row["name"],
                easy_name=latest_row.get("easy_name"),
                scheduled_time=", ".join(scheduled_times) or latest_row["scheduled_time"],
                expected_count=expected_count,
                taken_count=taken_count,
                missed_count=missed_count,
                completion_rate=_rate(taken_count, expected_count),
                last_status=latest_row["status"],
                last_recorded_at=latest_row["recorded_at"],
                trend=[row["status"] for row in sorted_rows[-7:]],
            )
        )

    return sorted(
        analytics,
        key=lambda item: (item.completion_rate, item.missed_count * -1, item.scheduled_time),
    )


def _build_schedule_grid(
    rows: list[dict],
    start_date: date,
    days: int,
) -> list[MedicationScheduleGridRow]:
    date_keys = [start_date + timedelta(days=index) for index in range(days)]
    rows_by_time: dict[str, list[dict]] = defaultdict(list)
    time_values: dict[str, time | None] = {}

    for row in rows:
        scheduled_time = row["scheduled_time"]
        rows_by_time[scheduled_time].append(row)
        time_values[scheduled_time] = row["scheduled_time_value"]

    sorted_times = sorted(
        rows_by_time.keys(),
        key=lambda value: (
            time_values[value].hour if time_values.get(value) else 99,
            time_values[value].minute if time_values.get(value) else 99,
            value,
        ),
    )

    grid_rows: list[MedicationScheduleGridRow] = []
    for index, scheduled_time in enumerate(sorted_times):
        time_rows = rows_by_time[scheduled_time]
        cells = []

        for date_key in date_keys:
            cell_rows = [row for row in time_rows if row["date"] == date_key]
            cells.append(_build_schedule_grid_cell(date_key, cell_rows))

        grid_rows.append(
            MedicationScheduleGridRow(
                time=scheduled_time,
                label=f"{index + 1}회차",
                cells=cells,
            )
        )

    return grid_rows


def _build_schedule_grid_cell(
    date_key: date,
    rows: list[dict],
) -> MedicationScheduleGridCell:
    total_count = len(rows)
    taken_count = sum(1 for row in rows if row["status"] == "taken")
    missed_count = sum(1 for row in rows if row["status"] == "missed")
    pending_count = sum(1 for row in rows if row["status"] == "pending")
    scheduled_count = sum(1 for row in rows if row["status"] == "scheduled")
    medication_names = _unique_medication_names(row["name"] for row in rows)
    medication_easy_names = _unique_medication_names(
        row.get("easy_name") or row["name"] for row in rows
    )
    status = _resolve_grid_cell_status(
        total_count=total_count,
        taken_count=taken_count,
        missed_count=missed_count,
        pending_count=pending_count,
        scheduled_count=scheduled_count,
    )

    return MedicationScheduleGridCell(
        date=date_key.isoformat(),
        status=status,
        label=_format_grid_cell_label(
            total_count=total_count,
            taken_count=taken_count,
            missed_count=missed_count,
            pending_count=pending_count,
            scheduled_count=scheduled_count,
        ),
        total_count=total_count,
        taken_count=taken_count,
        missed_count=missed_count,
        pending_count=pending_count,
        scheduled_count=scheduled_count,
        medication_names=medication_names,
        medication_easy_names=medication_easy_names,
    )


def _resolve_grid_cell_status(
    *,
    total_count: int,
    taken_count: int,
    missed_count: int,
    pending_count: int,
    scheduled_count: int,
) -> str:
    if total_count <= 0:
        return "scheduled"
    if missed_count > 0:
        return "missed"
    if pending_count > 0:
        return "partial" if taken_count > 0 else "pending"
    if taken_count == total_count:
        return "taken"
    if scheduled_count == total_count:
        return "scheduled"
    return "partial"


def _format_grid_cell_label(
    *,
    total_count: int,
    taken_count: int,
    missed_count: int,
    pending_count: int,
    scheduled_count: int,
) -> str:
    if total_count <= 0:
        return "-"
    if missed_count > 0:
        return f"누락 {missed_count}" if total_count > 1 else "누락"
    if pending_count > 0:
        return f"{taken_count}/{total_count} 완료" if taken_count > 0 else "대기"
    if taken_count == total_count:
        return "완료" if total_count == 1 else f"{taken_count}/{total_count} 완료"
    if scheduled_count == total_count:
        return "예정"
    return f"{taken_count}/{total_count} 완료"


def _unique_medication_names(names) -> list[str]:
    seen = set()
    result = []

    for name in names:
        key = _medication_name_key(name)
        if not key or key in seen:
            continue

        seen.add(key)
        result.append(name)

    return result


def _build_recent_missed_history(rows: list[dict]) -> list[MedicationMissedHistoryItem]:
    missed_rows = [
        row
        for row in rows
        if row["status"] == "missed"
    ]
    missed_rows.sort(key=lambda row: (row["date"], row["scheduled_time"]), reverse=True)

    return [
        MedicationMissedHistoryItem(
            date=row["date"].isoformat(),
            time=row["scheduled_time"],
            medication_name=row["name"],
            medication_easy_name=row.get("easy_name"),
        )
        for row in missed_rows[:8]
    ]


def _medication_name_key(value: str) -> str:
    return "".join(str(value or "").split()).lower()


def _current_missed_streak(rows: list[dict]) -> int:
    streak = 0
    for row in sorted(rows, key=lambda item: (item["date"], item["scheduled_time"]), reverse=True):
        if not row["is_expected"]:
            continue
        if row["status"] == "missed":
            streak += 1
            continue
        break
    return streak


def _longest_missed_streak(rows: list[dict]) -> int:
    longest = 0
    current = 0
    for row in sorted(rows, key=lambda item: (item["date"], item["scheduled_time"])):
        if not row["is_expected"]:
            continue
        if row["status"] == "missed":
            current += 1
            longest = max(longest, current)
            continue
        current = 0
    return longest


def _empty_time_slots() -> list[MedicationTimeSlotAnalytics]:
    return [
        MedicationTimeSlotAnalytics(
            slot=slot,
            label=label,
            expected_count=0,
            missed_count=0,
            missed_rate=0,
        )
        for slot, label in _slot_labels().items()
    ]


def _slot_labels() -> dict[str, str]:
    return {
        "morning": "아침",
        "lunch": "점심",
        "evening": "저녁",
        "night": "밤",
    }


def _time_slot_for(value: time | None) -> str:
    if not value:
        return "morning"

    minutes = value.hour * 60 + value.minute
    if 5 * 60 <= minutes < 11 * 60:
        return "morning"
    if 11 * 60 <= minutes < 15 * 60:
        return "lunch"
    if 15 * 60 <= minutes < 21 * 60:
        return "evening"
    return "night"


def _rate(numerator: int, denominator: int) -> int:
    if denominator <= 0:
        return 0
    return int(round((numerator / denominator) * 100))


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
