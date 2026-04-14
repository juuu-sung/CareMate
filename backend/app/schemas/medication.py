from datetime import datetime
from typing import Literal

from pydantic import BaseModel


MedicationStatus = Literal["scheduled", "taken", "missed"]


class MedicationItem(BaseModel):
    name: str
    time: str
    status: MedicationStatus
    status_label: str
    last_time_scope: str | None = None
    last_recorded_at: datetime | None = None
    source: str | None = None


class MedicationListResponse(BaseModel):
    items: list[MedicationItem]
