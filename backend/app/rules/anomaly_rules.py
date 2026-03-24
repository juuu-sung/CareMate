from dataclasses import dataclass


@dataclass
class AnomalyInput:
    check_in_missed: bool
    medication_missed_count: int
    schedule_missed_count: int
    sos_requested: bool
    inactive_minutes: int


@dataclass
class AnomalyResult:
    needs_user_confirmation: bool
    notify_guardian: bool
    reason: str


def evaluate_anomaly(payload: AnomalyInput) -> AnomalyResult:
    if payload.sos_requested:
        return AnomalyResult(
            needs_user_confirmation=False,
            notify_guardian=True,
            reason="sos_requested",
        )

    if payload.check_in_missed or payload.medication_missed_count >= 3:
        return AnomalyResult(
            needs_user_confirmation=True,
            notify_guardian=False,
            reason="confirmation_required",
        )

    if payload.inactive_minutes >= 180:
        return AnomalyResult(
            needs_user_confirmation=True,
            notify_guardian=False,
            reason="long_inactivity",
        )

    return AnomalyResult(
        needs_user_confirmation=False,
        notify_guardian=False,
        reason="normal",
    )
