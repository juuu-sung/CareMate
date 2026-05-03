from datetime import datetime
from typing import Literal

from pydantic import BaseModel


MedicationStatus = Literal["scheduled", "taken", "missed"]


class MedicationItem(BaseModel):
    id: str | None = None
    name: str
    time: str
    status: MedicationStatus
    status_label: str
    last_time_scope: str | None = None
    last_recorded_at: datetime | None = None
    source: str | None = None


class MedicationListResponse(BaseModel):
    items: list[MedicationItem]


class MedicationRecordRequest(BaseModel):
    elder_user_id: str | None = None
    medication_id: str | None = None
    medication_name: str
    time_scope: str | None = None
    status: MedicationStatus = "taken"


class MedicationRecordResponse(BaseModel):
    medication_name: str
    time_scope: str
    status: MedicationStatus
    status_label: str
