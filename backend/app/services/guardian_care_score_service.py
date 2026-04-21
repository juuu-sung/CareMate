from datetime import datetime
from typing import Literal


GuardianCareLevel = Literal["stable", "check", "caution"]

HIGH_ALERT_PENALTY_PER_ITEM = 25
HIGH_ALERT_PENALTY_CAP = 50
MEDIUM_ALERT_PENALTY_PER_ITEM = 10
MEDIUM_ALERT_PENALTY_CAP = 20
CHECK_IN_PENDING_SOFT_PENALTY = 5
CHECK_IN_PENDING_HARD_PENALTY = 10
CHECK_IN_MISSED_PENALTY = 20
CHECK_IN_PENDING_WARNING_MINUTES = 15
CHECK_IN_PENDING_HIGH_RISK_MINUTES = 60
MISSED_MEDICATION_PENALTY_PER_ITEM = 10
MISSED_MEDICATION_PENALTY_CAP = 20
SEVERE_OVERDUE_MEDICATION_PENALTY_PER_ITEM = 10
SEVERE_OVERDUE_MEDICATION_PENALTY_CAP = 20
OVERDUE_MEDICATION_PENALTY_PER_ITEM = 5
OVERDUE_MEDICATION_PENALTY_CAP = 10
LOCATION_STALE_WARNING_PENALTY = 5
LOCATION_STALE_HIGH_RISK_PENALTY = 10
LOCATION_STALE_WARNING_MINUTES = 12 * 60
LOCATION_STALE_HIGH_RISK_MINUTES = 24 * 60


def build_guardian_care_score(snapshot: dict) -> dict:
    open_high_alert_count = int(snapshot.get("open_high_alert_count") or 0)
    open_medium_alert_count = int(snapshot.get("open_medium_alert_count") or 0)
    check_in_status = snapshot.get("check_in_status") or "responded"
    check_in_requested_at = snapshot.get("check_in_requested_at")
    missed_medication_count = int(snapshot.get("missed_medication_count") or 0)
    severe_overdue_medication_count = int(snapshot.get("severe_overdue_medication_count") or 0)
    overdue_medication_count = int(snapshot.get("overdue_medication_count") or 0)
    location_monitoring_enabled = bool(snapshot.get("location_monitoring_enabled"))
    location_staleness_minutes = snapshot.get("location_staleness_minutes")

    high_alert_penalty = min(
        open_high_alert_count * HIGH_ALERT_PENALTY_PER_ITEM,
        HIGH_ALERT_PENALTY_CAP,
    )
    medium_alert_penalty = min(
        open_medium_alert_count * MEDIUM_ALERT_PENALTY_PER_ITEM,
        MEDIUM_ALERT_PENALTY_CAP,
    )
    alert_penalty = high_alert_penalty + medium_alert_penalty

    check_in_penalty, check_in_label = _resolve_check_in_penalty(
        status=check_in_status,
        requested_at=check_in_requested_at,
    )
    medication_penalty, medication_items = _resolve_medication_penalty(
        missed_medication_count=missed_medication_count,
        severe_overdue_medication_count=severe_overdue_medication_count,
        overdue_medication_count=overdue_medication_count,
    )
    location_penalty, location_label = _resolve_location_penalty(
        location_monitoring_enabled=location_monitoring_enabled,
        location_staleness_minutes=location_staleness_minutes,
    )

    total_penalty = alert_penalty + check_in_penalty + medication_penalty + location_penalty
    care_score = max(0, 100 - total_penalty)
    care_level = _apply_level_floor(
        _resolve_care_level(care_score),
        open_high_alert_count=open_high_alert_count,
        open_medium_alert_count=open_medium_alert_count,
        check_in_status=check_in_status,
        check_in_penalty=check_in_penalty,
        missed_medication_count=missed_medication_count,
        severe_overdue_medication_count=severe_overdue_medication_count,
        location_penalty=location_penalty,
    )
    care_penalty_items = _build_care_penalty_items(
        open_high_alert_count=open_high_alert_count,
        high_alert_penalty=high_alert_penalty,
        open_medium_alert_count=open_medium_alert_count,
        medium_alert_penalty=medium_alert_penalty,
        check_in_label=check_in_label,
        check_in_penalty=check_in_penalty,
        medication_items=medication_items,
        location_label=location_label,
        location_penalty=location_penalty,
    )
    care_reasons = [item["label"] for item in care_penalty_items]

    return {
        "care_score": care_score,
        "care_level": care_level,
        "care_summary": _build_care_summary(care_level, care_reasons),
        "care_reasons": care_reasons,
        "care_penalty_items": care_penalty_items,
        "care_penalties": {
            "alerts": alert_penalty,
            "check_in": check_in_penalty,
            "medication": medication_penalty,
            "location": location_penalty,
            "total": total_penalty,
        },
    }


def _resolve_care_level(score: int) -> GuardianCareLevel:
    if score >= 90:
        return "stable"
    if score >= 70:
        return "check"
    return "caution"


def _build_care_summary(level: GuardianCareLevel, reasons: list[str]) -> str:
    if level == "caution":
        return "오늘 바로 확인이 필요한 돌봄 신호가 있어요."
    if level == "check":
        return "오늘 확인이 필요한 돌봄 항목이 남아 있어요."
    if reasons:
        return "전반적으로 안정적이지만 일부 돌봄 항목은 계속 확인해 주세요."
    return "오늘은 큰 이상 신호 없이 안정적으로 관리되고 있어요."


def _resolve_check_in_penalty(
    *,
    status: str,
    requested_at: datetime | None,
) -> tuple[int, str | None]:
    if status == "missed":
        return CHECK_IN_MISSED_PENALTY, "최근 체크인 누락"

    if status != "pending" or not requested_at:
        return 0, None

    pending_minutes = max(0, int((datetime.now(requested_at.tzinfo) - requested_at).total_seconds() // 60))
    if pending_minutes >= CHECK_IN_PENDING_HIGH_RISK_MINUTES:
        return CHECK_IN_PENDING_HARD_PENALTY, f"체크인 응답 지연 {pending_minutes}분"
    if pending_minutes >= CHECK_IN_PENDING_WARNING_MINUTES:
        return CHECK_IN_PENDING_SOFT_PENALTY, f"체크인 응답 대기 {pending_minutes}분"
    return 0, None


def _resolve_medication_penalty(
    *,
    missed_medication_count: int,
    severe_overdue_medication_count: int,
    overdue_medication_count: int,
) -> tuple[int, list[dict[str, int | str]]]:
    items: list[dict[str, int | str]] = []

    missed_penalty = min(
        missed_medication_count * MISSED_MEDICATION_PENALTY_PER_ITEM,
        MISSED_MEDICATION_PENALTY_CAP,
    )
    if missed_penalty > 0:
        items.append(
            {
                "label": f"복약 누락 {missed_medication_count}건",
                "penalty": missed_penalty,
            }
        )

    severe_overdue_penalty = min(
        severe_overdue_medication_count * SEVERE_OVERDUE_MEDICATION_PENALTY_PER_ITEM,
        SEVERE_OVERDUE_MEDICATION_PENALTY_CAP,
    )
    if severe_overdue_penalty > 0:
        items.append(
            {
                "label": f"2시간 이상 지난 복약 {severe_overdue_medication_count}건",
                "penalty": severe_overdue_penalty,
            }
        )

    overdue_penalty = min(
        overdue_medication_count * OVERDUE_MEDICATION_PENALTY_PER_ITEM,
        OVERDUE_MEDICATION_PENALTY_CAP,
    )
    if overdue_penalty > 0:
        items.append(
            {
                "label": f"1시간 이상 지난 복약 {overdue_medication_count}건",
                "penalty": overdue_penalty,
            }
        )

    return missed_penalty + severe_overdue_penalty + overdue_penalty, items


def _resolve_location_penalty(
    *,
    location_monitoring_enabled: bool,
    location_staleness_minutes: int | None,
) -> tuple[int, str | None]:
    if not location_monitoring_enabled:
        return 0, None

    if location_staleness_minutes is None:
        return LOCATION_STALE_HIGH_RISK_PENALTY, "위치 기록 없음"

    if location_staleness_minutes >= LOCATION_STALE_HIGH_RISK_MINUTES:
        return LOCATION_STALE_HIGH_RISK_PENALTY, "24시간 이상 위치 미갱신"

    if location_staleness_minutes >= LOCATION_STALE_WARNING_MINUTES:
        return LOCATION_STALE_WARNING_PENALTY, "12시간 이상 위치 미갱신"

    return 0, None


def _apply_level_floor(
    current_level: GuardianCareLevel,
    *,
    open_high_alert_count: int,
    open_medium_alert_count: int,
    check_in_status: str,
    check_in_penalty: int,
    missed_medication_count: int,
    severe_overdue_medication_count: int,
    location_penalty: int,
) -> GuardianCareLevel:
    floor = current_level

    if open_high_alert_count > 0 or (check_in_status == "missed" and location_penalty > 0):
        floor = _max_level(floor, "caution")
    elif (
        open_medium_alert_count > 0
        or check_in_penalty >= CHECK_IN_PENDING_HARD_PENALTY
        or missed_medication_count > 0
        or severe_overdue_medication_count > 0
    ):
        floor = _max_level(floor, "check")

    return floor


def _build_care_penalty_items(
    *,
    open_high_alert_count: int,
    high_alert_penalty: int,
    open_medium_alert_count: int,
    medium_alert_penalty: int,
    check_in_label: str | None,
    check_in_penalty: int,
    medication_items: list[dict[str, int | str]],
    location_label: str | None,
    location_penalty: int,
) -> list[dict[str, int | str]]:
    items: list[dict[str, int | str]] = []

    if high_alert_penalty > 0:
        items.append(
            {
                "label": f"중요 알림 {open_high_alert_count}건",
                "penalty": high_alert_penalty,
            }
        )

    if medium_alert_penalty > 0:
        items.append(
            {
                "label": f"일반 알림 {open_medium_alert_count}건",
                "penalty": medium_alert_penalty,
            }
        )

    if check_in_penalty > 0 and check_in_label:
        items.append({"label": check_in_label, "penalty": check_in_penalty})

    items.extend(medication_items)

    if location_penalty > 0 and location_label:
        items.append({"label": location_label, "penalty": location_penalty})

    return items


def _max_level(left: GuardianCareLevel, right: GuardianCareLevel) -> GuardianCareLevel:
    order = {"stable": 0, "check": 1, "caution": 2}
    return left if order[left] >= order[right] else right
