from pydantic import BaseModel


class GuardianOptions(BaseModel):
    check_in_interval_minutes: int = 180
    alert_repeat_count: int = 3
    always_on_location_enabled: bool = True


class CareModeResponse(BaseModel):
    mode: str
    options: GuardianOptions


class CareModeUpdateRequest(BaseModel):
    mode: str
    options: GuardianOptions
