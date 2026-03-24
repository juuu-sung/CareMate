from app.schemas.guardians import GuardianDashboardResponse


def get_guardian_dashboard() -> GuardianDashboardResponse:
    return GuardianDashboardResponse(
        care_mode="basic",
        check_in_status="responded",
        latest_location_status="available",
        latest_location_label="서울시청 인근",
        latest_location_captured_at="2026-03-24T10:20:00+09:00",
        open_alert_count=1,
        today_medication_pending_count=1,
        today_schedule_count=2,
    )
