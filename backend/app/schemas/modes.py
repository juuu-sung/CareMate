from typing import Literal

from pydantic import BaseModel

CareMode = Literal["basic", "cognitive_support", "health_support"]


class GuardianOptions(BaseModel):
    check_in_interval_minutes: int = 180
    alert_repeat_count: int = 3
    always_on_location_enabled: bool = True


class CareModeResponse(BaseModel):
    mode: CareMode
    options: GuardianOptions


class CareModeUpdateRequest(BaseModel):
    mode: CareMode
    options: GuardianOptions
