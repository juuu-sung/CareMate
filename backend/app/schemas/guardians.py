from pydantic import BaseModel


class GuardianDashboardResponse(BaseModel):
    care_mode: str
    check_in_status: str
    latest_location_status: str
    latest_location_label: str | None = None
    latest_location_captured_at: str | None = None
    open_alert_count: int
    today_medication_pending_count: int
    today_schedule_count: int
