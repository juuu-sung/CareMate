from pydantic import BaseModel


class GuardianContactResponse(BaseModel):
    guardian_user_id: str
    guardian_name: str = ""
    guardian_phone: str = ""