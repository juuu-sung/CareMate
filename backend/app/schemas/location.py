from datetime import datetime

from pydantic import BaseModel, Field


class LocationSyncRequest(BaseModel):
    elder_user_id: str = Field(min_length=1)
    link_code: str = Field(min_length=1)
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


class LocationRequestPayload(BaseModel):
    elder_user_id: str = Field(min_length=1)
    link_code: str = Field(min_length=1)


class LocationRequestStatusResponse(BaseModel):
    elder_user_id: str
    link_code: str
    pending: bool
    requested_at: datetime | None = None
    message: str
