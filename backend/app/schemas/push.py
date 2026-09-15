from typing import Literal

from pydantic import BaseModel


PushUserRole = Literal["elder", "guardian"]


class PushTokenRegisterRequest(BaseModel):
    user_role: PushUserRole
    expo_push_token: str
    device_id: str
    platform: str = "unknown"


class PushTokenRegisterResponse(BaseModel):
    registered: bool
    user_role: PushUserRole
    elder_user_id: str


class PushTokenDisableRequest(BaseModel):
    expo_push_token: str | None = None
    device_id: str | None = None


class PushTokenDisableResponse(BaseModel):
    disabled_count: int
