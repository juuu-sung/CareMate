from pydantic import BaseModel


class AlertItem(BaseModel):
    type: str
    message: str
    created_at: str


class AlertEventCreateRequest(BaseModel):
    elder_user_id: str
    link_code: str
    type: str
    message: str
    severity: str = "medium"


class AlertEventCreateResponse(BaseModel):
    elder_user_id: str
    link_code: str
    type: str
    message: str
    created: bool
