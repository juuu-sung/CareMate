from typing import Literal

from pydantic import BaseModel, Field

CareMode = Literal["basic", "cognitive_support", "health_support"]


class GuardianOptions(BaseModel):
    check_in_interval_minutes: int = Field(default=180, ge=30, le=1440)
    alert_repeat_count: int = Field(default=3, ge=1, le=10)
    always_on_location_enabled: bool = True


class CareModeResponse(BaseModel):
    mode: CareMode
    options: GuardianOptions


class CareModeUpdateRequest(BaseModel):
    mode: CareMode
    options: GuardianOptions
