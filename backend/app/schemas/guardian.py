from pydantic import BaseModel
from typing import Optional


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


class ParentInfoByCodeResponse(BaseModel):
    parent_id: str
    parent_name: str
    parent_age: Optional[int] = None
    parent_gender: Optional[str] = None