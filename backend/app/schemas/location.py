from datetime import datetime

from pydantic import BaseModel, Field


class LocationSyncRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    source: str = Field(default="mobile", min_length=1)


class LocationSyncResponse(BaseModel):
    elder_user_id: str
    latitude: float
    longitude: float
    source: str
    captured_at: datetime
    message: str


class LocationRequestStatusResponse(BaseModel):
    elder_user_id: str
    pending: bool
    requested_at: datetime | None = None
    message: str
