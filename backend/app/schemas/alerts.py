from typing import Literal

from pydantic import BaseModel, Field


AlertStatus = Literal["open", "acknowledged", "resolved"]


class AlertItem(BaseModel):
    id: str
    type: str
    severity: str
    status: AlertStatus
    message: str
    created_at: str


class AlertEventCreateRequest(BaseModel):
    type: Literal["emergency_call", "guardian_call"]
    message: str = Field(min_length=1, max_length=300)
    severity: Literal["low", "medium", "high"] = "medium"


class AlertEventCreateResponse(BaseModel):
    elder_user_id: str
    type: str
    message: str
    created: bool


class AlertStatusUpdateRequest(BaseModel):
    status: Literal["acknowledged", "resolved"]
    type: str | None = None
    message: str | None = None
    created_at: str | None = None


class AlertSweepResponse(BaseModel):
    created_count: int
    medication_missed: int
    location_stale: int
    check_in_missed: int
