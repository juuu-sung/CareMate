from pydantic import BaseModel
from typing import Optional

from app.schemas.alerts import AlertItem
from app.schemas.chat import ChatHistoryItem


class GuardianSignupRequest(BaseModel):
    name: str
    birth: str
    phone: str
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


class GuardianLoginRequest(BaseModel):
    phone: str
    birth: str


class GuardianLoginResponse(BaseModel):
    guardian_id: str
    guardian_name: str
    parent_id: str
    parent_name: str
    parent_age: Optional[int] = None
    parent_gender: Optional[str] = None
    link_code: str
    medications: str = ""
    diseases: str = ""
    allergies: str = ""
    hospital: str = ""
    doctor_contact: str = ""
    memo: str = ""
    message: str = "보호자 로그인이 완료되었습니다."


class ParentInfoByCodeResponse(BaseModel):
    parent_id: str
    parent_name: str
    parent_age: Optional[int] = None
    parent_gender: Optional[str] = None


class GuardianDashboardResponse(BaseModel):
    care_mode: str
    check_in_status: str
    latest_location_status: str
    latest_location_label: str
    latest_location_captured_at: str = ""
    open_alert_count: int
    today_medication_pending_count: int
    today_schedule_count: int


class GuardianAlertsResponse(BaseModel):
    items: list[AlertItem]


class GuardianConversationsResponse(BaseModel):
    items: list[ChatHistoryItem]
