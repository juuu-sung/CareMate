from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.alerts import AlertItem
from app.schemas.chat import ChatHistoryItem


class GuardianSignupRequest(BaseModel):
    name: str
    birth: str
    phone: str
    password: str = Field(..., min_length=8, max_length=128)
    link_code: str

    relation: Optional[str] = None
    gender: Optional[str] = None


class GuardianSignupResponse(BaseModel):
    message: str
    guardian_id: str
    parent_id: str
    parent_name: str
    parent_age: Optional[int] = None
    parent_gender: Optional[str] = None
    link_id: str
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime


class GuardianLoginRequest(BaseModel):
    phone: str
    birth: str
    password: str = Field(..., min_length=8, max_length=128)
    link_code: Optional[str] = Field(default=None, min_length=6, max_length=8)


class GuardianLoginResponse(BaseModel):
    guardian_id: str
    guardian_name: str
    parent_id: str
    parent_name: str
    parent_age: Optional[int] = None
    parent_gender: Optional[str] = None
    link_id: str
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    medications: str = ""
    diseases: str = ""
    allergies: str = ""
    hospital: str = ""
    doctor_contact: str = ""
    memo: str = ""
    message: str = "보호자 로그인이 완료되었습니다."


class GuardianCarePenaltyResponse(BaseModel):
    alerts: int
    check_in: int
    medication: int
    location: int
    total: int


class GuardianCarePenaltyItemResponse(BaseModel):
    label: str
    penalty: int


class GuardianHealthDomainScoresResponse(BaseModel):
    clinical_stability: int
    medication_stability: int
    engagement_stability: int


class GuardianCareProcessScoresResponse(BaseModel):
    medication_execution: int
    check_in_execution: int
    monitoring_continuity: int | None = None


class GuardianDashboardResponse(BaseModel):
    care_mode: str
    scoring_version: str = "caremate_v1"
    today_risk_level: Literal["stable", "check", "caution", "urgent"]
    today_risk_reasons: list[str]
    health_reserve_score: int
    care_execution_score: int
    health_domain_scores: GuardianHealthDomainScoresResponse
    care_process_scores: GuardianCareProcessScoresResponse
    care_score: int
    care_level: Literal["stable", "check", "caution", "urgent"]
    care_summary: str
    care_reasons: list[str]
    care_penalties: GuardianCarePenaltyResponse
    care_penalty_items: list[GuardianCarePenaltyItemResponse]
    check_in_status: str
    latest_location_status: str
    latest_location_label: str
    latest_location_captured_at: str = ""
    open_alert_count: int
    today_medication_total_count: int = 0
    today_medication_taken_count: int = 0
    today_medication_completion_rate: int = 0
    today_medication_pending_count: int
    overdue_medication_count: int
    severe_overdue_medication_count: int
    missed_medication_count: int
    today_schedule_count: int


class GuardianAlertsResponse(BaseModel):
    items: list[AlertItem]


class GuardianConversationDay(BaseModel):
    date_key: str
    headline: str
    summary: str
    topics: list[str] = Field(default_factory=list)
    message_count: int
    started_at: str = ""
    ended_at: str = ""
    attention_needed: bool = False
    attention_reason: str = ""
    items: list[ChatHistoryItem]


class GuardianConversationsResponse(BaseModel):
    days: list[GuardianConversationDay]


class GuardianScheduleItem(BaseModel):
    id: str
    title: str
    description: str = ""
    date: str
    time: str
    status: str
    type: str = "hospital"
    scheduled_at: str


class GuardianSchedulesResponse(BaseModel):
    items: list[GuardianScheduleItem]


class GuardianScheduleCreateRequest(BaseModel):
    title: str
    date: str
    time: str
    description: str = ""
    status: str = "scheduled"
    type: str = "hospital"


class GuardianScheduleUpdateRequest(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    type: Optional[str] = None


class GuardianScheduleDeleteResponse(BaseModel):
    success: bool
