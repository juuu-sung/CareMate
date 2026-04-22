from datetime import datetime
from typing import Literal


GuardianCareLevel = Literal["stable", "check", "caution", "urgent"]

RISK_CHECK_CHECKIN_MINUTES = 30
RISK_CAUTION_CHECKIN_MINUTES = 90
RISK_CHECK_LOCATION_MINUTES = 12 * 60
RISK_CAUTION_LOCATION_MINUTES = 24 * 60

CLINICAL_HIGH_ALERT_PENALTY = 35
CLINICAL_MEDIUM_ALERT_PENALTY = 15
CLINICAL_LOW_ALERT_PENALTY = 5
CLINICAL_DOMAIN_CAP = 60

MEDICATION_MISSED_PENALTY = 25
MEDICATION_SEVERE_OVERDUE_PENALTY = 12
MEDICATION_OVERDUE_PENALTY = 6
MEDICATION_DOMAIN_CAP = 60

PROCESS_MISSED_MEDICATION_PENALTY = 20
PROCESS_SEVERE_OVERDUE_PENALTY = 10
PROCESS_OVERDUE_PENALTY = 5
PROCESS_MEDICATION_CAP = 70

MONITORING_NO_SIGNAL_SCORE = 20
MONITORING_WARNING_SCORE = 70
MONITORING_HIGH_RISK_SCORE = 30


def build_guardian_care_score(snapshot: dict) -> dict:
    open_high_alert_count = int(snapshot.get("open_high_alert_count") or 0)
    open_medium_alert_count = int(snapshot.get("open_medium_alert_count") or 0)
    open_low_alert_count = int(snapshot.get("open_low_alert_count") or 0)
    check_in_status = str(snapshot.get("check_in_status") or "responded")
    check_in_requested_at = snapshot.get("check_in_requested_at")
    missed_medication_count = int(snapshot.get("missed_medication_count") or 0)
    severe_overdue_medication_count = int(snapshot.get("severe_overdue_medication_count") or 0)
    overdue_medication_count = int(snapshot.get("overdue_medication_count") or 0)
    location_monitoring_enabled = bool(snapshot.get("location_monitoring_enabled"))
    location_staleness_minutes = snapshot.get("location_staleness_minutes")

    pending_check_in_minutes = _resolve_pending_check_in_minutes(
        status=check_in_status,
        requested_at=check_in_requested_at,
    )

    today_risk_level, today_risk_reasons = _resolve_today_risk_level_and_reasons(
        open_high_alert_count=open_high_alert_count,
        open_medium_alert_count=open_medium_alert_count,
        check_in_status=check_in_status,
        pending_check_in_minutes=pending_check_in_minutes,
        missed_medication_count=missed_medication_count,
        severe_overdue_medication_count=severe_overdue_medication_count,
        overdue_medication_count=overdue_medication_count,
        location_monitoring_enabled=location_monitoring_enabled,
        location_staleness_minutes=location_staleness_minutes,
    )

    health_domain_scores, raw_health_penalties = _build_health_domain_scores(
        open_high_alert_count=open_high_alert_count,
        open_medium_alert_count=open_medium_alert_count,
        open_low_alert_count=open_low_alert_count,
        missed_medication_count=missed_medication_count,
        severe_overdue_medication_count=severe_overdue_medication_count,
        overdue_medication_count=overdue_medication_count,
        check_in_status=check_in_status,
        pending_check_in_minutes=pending_check_in_minutes,
    )
    health_reserve_score = _build_health_reserve_score(raw_health_penalties)

    care_process_scores = _build_care_process_scores(
        missed_medication_count=missed_medication_count,
        severe_overdue_medication_count=severe_overdue_medication_count,
        overdue_medication_count=overdue_medication_count,
        check_in_status=check_in_status,
        pending_check_in_minutes=pending_check_in_minutes,
        location_monitoring_enabled=location_monitoring_enabled,
        location_staleness_minutes=location_staleness_minutes,
    )
    care_execution_score = _build_care_execution_score(care_process_scores)

    care_penalties = _build_legacy_penalty_projection(
        raw_health_penalties=raw_health_penalties,
        health_reserve_score=health_reserve_score,
    )
    care_penalty_items = _build_legacy_penalty_items(care_penalties)
    care_reasons = today_risk_reasons or [item["label"] for item in care_penalty_items]

    return {
        "scoring_version": "caremate_v1",
        "today_risk_level": today_risk_level,
        "today_risk_reasons": today_risk_reasons,
        "health_reserve_score": health_reserve_score,
        "care_execution_score": care_execution_score,
        "health_domain_scores": health_domain_scores,
        "care_process_scores": care_process_scores,
        "care_score": health_reserve_score,
        "care_level": today_risk_level,
        "care_summary": _build_care_summary(
            risk_level=today_risk_level,
            health_reserve_score=health_reserve_score,
            reasons=today_risk_reasons,
        ),
        "care_reasons": care_reasons,
        "care_penalty_items": care_penalty_items,
        "care_penalties": care_penalties,
    }


def _resolve_pending_check_in_minutes(
    *,
    status: str,
    requested_at: datetime | None,
) -> int | None:
    if status != "pending" or not requested_at:
        return None

    return max(
        0,
        int((datetime.now(requested_at.tzinfo) - requested_at).total_seconds() // 60),
    )


def _resolve_today_risk_level_and_reasons(
    *,
    open_high_alert_count: int,
    open_medium_alert_count: int,
    check_in_status: str,
    pending_check_in_minutes: int | None,
    missed_medication_count: int,
    severe_overdue_medication_count: int,
    overdue_medication_count: int,
    location_monitoring_enabled: bool,
    location_staleness_minutes: int | None,
) -> tuple[GuardianCareLevel, list[str]]:
    reasons: list[str] = []

    if open_high_alert_count >= 1:
        reasons.append(f"중요 알림 {open_high_alert_count}건")
    elif open_medium_alert_count >= 1:
        reasons.append(f"일반 알림 {open_medium_alert_count}건")

    if check_in_status == "missed":
        reasons.append("최근 체크인 누락")
    elif pending_check_in_minutes is not None:
        if pending_check_in_minutes >= RISK_CAUTION_CHECKIN_MINUTES:
            reasons.append(f"체크인 응답 지연 {pending_check_in_minutes}분")
        elif pending_check_in_minutes >= RISK_CHECK_CHECKIN_MINUTES:
            reasons.append(f"체크인 응답 대기 {pending_check_in_minutes}분")

    if missed_medication_count >= 1:
        reasons.append(f"복약 누락 {missed_medication_count}건")
    elif severe_overdue_medication_count >= 1:
        reasons.append(f"2시간 이상 지난 복약 {severe_overdue_medication_count}건")
    elif overdue_medication_count >= 2:
        reasons.append(f"1시간 이상 지난 복약 {overdue_medication_count}건")

    if location_monitoring_enabled:
        if location_staleness_minutes is None:
            reasons.append("위치 기록 없음")
        elif location_staleness_minutes >= RISK_CAUTION_LOCATION_MINUTES:
            reasons.append("24시간 이상 위치 미갱신")
        elif location_staleness_minutes >= RISK_CHECK_LOCATION_MINUTES:
            reasons.append("12시간 이상 위치 미갱신")

    if (
        open_high_alert_count >= 1
        or check_in_status == "missed"
        or missed_medication_count >= 2
        or severe_overdue_medication_count >= 2
        or (
            pending_check_in_minutes is not None
            and pending_check_in_minutes >= RISK_CAUTION_CHECKIN_MINUTES
            and (missed_medication_count >= 1 or severe_overdue_medication_count >= 1)
        )
    ):
        return "urgent", reasons[:3]

    if (
        open_medium_alert_count >= 1
        or missed_medication_count >= 1
        or severe_overdue_medication_count >= 1
        or (
            pending_check_in_minutes is not None
            and pending_check_in_minutes >= RISK_CAUTION_CHECKIN_MINUTES
        )
        or (
            location_monitoring_enabled
            and (
                location_staleness_minutes is None
                or location_staleness_minutes >= RISK_CAUTION_LOCATION_MINUTES
            )
        )
    ):
        return "caution", reasons[:3]

    if (
        overdue_medication_count >= 2
        or (
            pending_check_in_minutes is not None
            and pending_check_in_minutes >= RISK_CHECK_CHECKIN_MINUTES
        )
        or (
            location_monitoring_enabled
            and location_staleness_minutes is not None
            and location_staleness_minutes >= RISK_CHECK_LOCATION_MINUTES
        )
    ):
        return "check", reasons[:3]

    return "stable", reasons[:3]


def _build_health_domain_scores(
    *,
    open_high_alert_count: int,
    open_medium_alert_count: int,
    open_low_alert_count: int,
    missed_medication_count: int,
    severe_overdue_medication_count: int,
    overdue_medication_count: int,
    check_in_status: str,
    pending_check_in_minutes: int | None,
) -> tuple[dict[str, int], dict[str, int]]:
    clinical_penalty = min(
        CLINICAL_DOMAIN_CAP,
        CLINICAL_HIGH_ALERT_PENALTY * min(open_high_alert_count, 1)
        + CLINICAL_MEDIUM_ALERT_PENALTY * min(open_medium_alert_count, 2)
        + CLINICAL_LOW_ALERT_PENALTY * min(open_low_alert_count, 2),
    )
    medication_penalty = min(
        MEDICATION_DOMAIN_CAP,
        MEDICATION_MISSED_PENALTY * min(missed_medication_count, 2)
        + MEDICATION_SEVERE_OVERDUE_PENALTY * min(severe_overdue_medication_count, 2)
        + MEDICATION_OVERDUE_PENALTY * min(overdue_medication_count, 2),
    )
    engagement_stability = _resolve_engagement_stability_score(
        status=check_in_status,
        pending_check_in_minutes=pending_check_in_minutes,
    )
    engagement_penalty = 100 - engagement_stability

    return (
        {
            "clinical_stability": 100 - clinical_penalty,
            "medication_stability": 100 - medication_penalty,
            "engagement_stability": engagement_stability,
        },
        {
            "clinical": clinical_penalty,
            "medication": medication_penalty,
            "engagement": engagement_penalty,
        },
    )


def _resolve_engagement_stability_score(
    *,
    status: str,
    pending_check_in_minutes: int | None,
) -> int:
    if status == "responded":
        return 100
    if status == "missed":
        return 20
    if pending_check_in_minutes is None:
        return 100
    if pending_check_in_minutes < RISK_CHECK_CHECKIN_MINUTES:
        return 90
    if pending_check_in_minutes < RISK_CAUTION_CHECKIN_MINUTES:
        return 70
    if pending_check_in_minutes < 180:
        return 50
    return 30


def _build_health_reserve_score(raw_health_penalties: dict[str, int]) -> int:
    health_penalty = round(
        (
            raw_health_penalties["clinical"]
            + raw_health_penalties["medication"]
            + raw_health_penalties["engagement"]
        )
        / 3
    )
    return max(0, 100 - health_penalty)


def _build_care_process_scores(
    *,
    missed_medication_count: int,
    severe_overdue_medication_count: int,
    overdue_medication_count: int,
    check_in_status: str,
    pending_check_in_minutes: int | None,
    location_monitoring_enabled: bool,
    location_staleness_minutes: int | None,
) -> dict[str, int | None]:
    medication_execution_penalty = min(
        PROCESS_MEDICATION_CAP,
        PROCESS_MISSED_MEDICATION_PENALTY * min(missed_medication_count, 2)
        + PROCESS_SEVERE_OVERDUE_PENALTY * min(severe_overdue_medication_count, 2)
        + PROCESS_OVERDUE_PENALTY * min(overdue_medication_count, 2),
    )
    medication_execution_score = 100 - medication_execution_penalty

    if check_in_status == "responded":
        check_in_execution_score = 100
    elif check_in_status == "missed":
        check_in_execution_score = 0
    elif pending_check_in_minutes is None:
        check_in_execution_score = 100
    elif pending_check_in_minutes < RISK_CHECK_CHECKIN_MINUTES:
        check_in_execution_score = 85
    elif pending_check_in_minutes < RISK_CAUTION_CHECKIN_MINUTES:
        check_in_execution_score = 60
    else:
        check_in_execution_score = 30

    monitoring_continuity_score: int | None
    if not location_monitoring_enabled:
        monitoring_continuity_score = None
    elif location_staleness_minutes is None:
        monitoring_continuity_score = MONITORING_NO_SIGNAL_SCORE
    elif location_staleness_minutes >= RISK_CAUTION_LOCATION_MINUTES:
        monitoring_continuity_score = MONITORING_HIGH_RISK_SCORE
    elif location_staleness_minutes >= RISK_CHECK_LOCATION_MINUTES:
        monitoring_continuity_score = MONITORING_WARNING_SCORE
    else:
        monitoring_continuity_score = 100

    return {
        "medication_execution": medication_execution_score,
        "check_in_execution": check_in_execution_score,
        "monitoring_continuity": monitoring_continuity_score,
    }


def _build_care_execution_score(care_process_scores: dict[str, int | None]) -> int:
    weighted_scores = {
        "medication_execution": 0.5,
        "check_in_execution": 0.3,
        "monitoring_continuity": 0.2,
    }

    total_weight = 0.0
    weighted_sum = 0.0

    for key, weight in weighted_scores.items():
        value = care_process_scores.get(key)
        if value is None:
            continue
        total_weight += weight
        weighted_sum += value * weight

    if total_weight <= 0:
        return 100

    return round(weighted_sum / total_weight)


def _build_legacy_penalty_projection(
    *,
    raw_health_penalties: dict[str, int],
    health_reserve_score: int,
) -> dict[str, int]:
    total_penalty = 100 - health_reserve_score
    raw_projection = {
        "alerts": raw_health_penalties["clinical"] / 3,
        "check_in": raw_health_penalties["engagement"] / 3,
        "medication": raw_health_penalties["medication"] / 3,
        "location": 0.0,
    }
    projected = _allocate_projected_penalties(raw_projection, total_penalty)
    projected["total"] = total_penalty
    return projected


def _allocate_projected_penalties(
    raw_projection: dict[str, float],
    total_penalty: int,
) -> dict[str, int]:
    allocated: dict[str, int] = {}
    fractional_parts: list[tuple[str, float]] = []
    running_total = 0

    for key, value in raw_projection.items():
        base_value = int(value)
        allocated[key] = base_value
        running_total += base_value
        fractional_parts.append((key, value - base_value))

    remainder = max(0, total_penalty - running_total)
    for key, _ in sorted(fractional_parts, key=lambda item: item[1], reverse=True):
        if remainder <= 0:
            break
        allocated[key] += 1
        remainder -= 1

    if remainder > 0:
        allocated["check_in"] += remainder

    return allocated


def _build_legacy_penalty_items(care_penalties: dict[str, int]) -> list[dict[str, int | str]]:
    items: list[dict[str, int | str]] = []

    if care_penalties["alerts"] > 0:
        items.append({"label": "건강 경보 신호", "penalty": care_penalties["alerts"]})
    if care_penalties["medication"] > 0:
        items.append({"label": "복약 안정도 저하", "penalty": care_penalties["medication"]})
    if care_penalties["check_in"] > 0:
        items.append({"label": "체크인 반응 저하", "penalty": care_penalties["check_in"]})
    if care_penalties["location"] > 0:
        items.append({"label": "모니터링 연속성 저하", "penalty": care_penalties["location"]})

    return items


def _build_care_summary(
    *,
    risk_level: GuardianCareLevel,
    health_reserve_score: int,
    reasons: list[str],
) -> str:
    if risk_level == "urgent":
        return "지금 바로 확인이 필요한 상태예요."
    if risk_level == "caution":
        return "오늘 주의해서 확인할 건강 신호가 있어요."
    if risk_level == "check":
        return "가볍게 지켜볼 건강 신호가 있어요."
    if health_reserve_score < 70:
        return "급한 신호는 없지만 상태를 조금 더 지켜봐 주세요."
    if reasons:
        return "큰 이상 신호는 없지만 일부 항목은 계속 살펴봐 주세요."
    return "오늘은 급하게 대응할 신호가 없습니다."
