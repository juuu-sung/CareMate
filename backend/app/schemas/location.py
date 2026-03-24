from pydantic import BaseModel


class LocationUpdateRequest(BaseModel):
    latitude: float
    longitude: float
    source: str = "mobile"


class LatestLocationResponse(BaseModel):
    latitude: float
    longitude: float
    captured_at: str
    source: str
