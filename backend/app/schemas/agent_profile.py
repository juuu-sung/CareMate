from pydantic import BaseModel
from typing import Optional


class AgentProfileUpdateRequest(BaseModel):
    elder_user_id: str

    agent_voice: Optional[str] = None
    agent_name: Optional[str] = None

    medications: Optional[str] = None
    allergies: Optional[str] = None
    diseases: Optional[str] = None


class AgentProfileResponse(BaseModel):
    elder_user_id: str

    agent_voice: Optional[str] = None
    agent_name: Optional[str] = None

    medications: Optional[str] = None
    allergies: Optional[str] = None
    diseases: Optional[str] = None