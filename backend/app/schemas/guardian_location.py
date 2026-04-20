from datetime import datetime

from pydantic import BaseModel


class GuardianLatestLocationResponse(BaseModel):
    status: str
    elder_user_id: str
    link_code: str
    latitude: float | None = None
    longitude: float | None = None
    source: str | None = None
    captured_at: datetime | None = None
    label: str
