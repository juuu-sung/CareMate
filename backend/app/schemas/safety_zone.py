from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


SafetyZoneStatus = Literal["unknown", "inside", "outside"]


class SafetyZoneBase(BaseModel):
    label: str = Field(default="안전구역", min_length=1, max_length=80)
    address: str = Field(default="", max_length=255)
    center_latitude: float = Field(ge=-90, le=90)
    center_longitude: float = Field(ge=-180, le=180)
    radius_meters: int = Field(default=300, ge=50, le=5000)
    enabled: bool = True


class SafetyZoneCreateRequest(SafetyZoneBase):
    pass


class SafetyZoneUpdateRequest(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=80)
    address: str | None = Field(default=None, max_length=255)
    center_latitude: float | None = Field(default=None, ge=-90, le=90)
    center_longitude: float | None = Field(default=None, ge=-180, le=180)
    radius_meters: int | None = Field(default=None, ge=50, le=5000)
    enabled: bool | None = None


class SafetyZoneItem(SafetyZoneBase):
    id: str
    senior_user_id: str
    last_status: SafetyZoneStatus = "unknown"
    last_checked_at: datetime | None = None
    last_exit_alert_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class SafetyZoneListResponse(BaseModel):
    items: list[SafetyZoneItem]


class SafetyZoneDeleteResponse(BaseModel):
    success: bool
