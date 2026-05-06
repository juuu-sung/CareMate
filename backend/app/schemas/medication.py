from datetime import datetime
from typing import Literal

from pydantic import BaseModel


MedicationStatus = Literal["scheduled", "taken", "missed"]
MedicationAnalyticsStatus = Literal["taken", "missed", "scheduled", "pending"]
MedicationGridStatus = Literal["taken", "missed", "scheduled", "pending", "partial"]


class MedicationItem(BaseModel):
    id: str | None = None
    name: str
    easy_name: str | None = None
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


class MedicationAnalyticsRange(BaseModel):
    days: int
    start_date: str
    end_date: str


class MedicationAnalyticsSummary(BaseModel):
    expected_count: int
    taken_count: int
    missed_count: int
    pending_count: int
    completion_rate: int
    missed_rate: int
    current_missed_streak: int
    longest_missed_streak: int


class MedicationDailyAnalytics(BaseModel):
    date: str
    expected_count: int
    taken_count: int
    missed_count: int
    pending_count: int
    completion_rate: int


class MedicationTimeSlotAnalytics(BaseModel):
    slot: str
    label: str
    expected_count: int
    missed_count: int
    missed_rate: int


class MedicationAdherenceAnalytics(BaseModel):
    medication_id: str | None = None
    name: str
    easy_name: str | None = None
    scheduled_time: str
    expected_count: int
    taken_count: int
    missed_count: int
    completion_rate: int
    last_status: MedicationAnalyticsStatus
    last_recorded_at: datetime | None = None
    trend: list[MedicationAnalyticsStatus]


class MedicationMissedHistoryItem(BaseModel):
    date: str
    time: str
    medication_name: str
    medication_easy_name: str | None = None


class MedicationScheduleGridCell(BaseModel):
    date: str
    status: MedicationGridStatus
    label: str
    total_count: int
    taken_count: int
    missed_count: int
    pending_count: int
    scheduled_count: int
    medication_names: list[str]
    medication_easy_names: list[str]


class MedicationScheduleGridRow(BaseModel):
    time: str
    label: str
    cells: list[MedicationScheduleGridCell]


class MedicationAnalyticsResponse(BaseModel):
    range: MedicationAnalyticsRange
    summary: MedicationAnalyticsSummary
    daily: list[MedicationDailyAnalytics]
    time_slots: list[MedicationTimeSlotAnalytics]
    medications: list[MedicationAdherenceAnalytics]
    schedule_grid: list[MedicationScheduleGridRow]
    recent_missed: list[MedicationMissedHistoryItem]
