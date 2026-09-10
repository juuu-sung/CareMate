from pydantic import BaseModel, Field
from datetime import datetime

class LetterCreateRequest(BaseModel):
    link_code: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1, max_length=1000)

class SendLetterRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)

class SendLetterResponse(BaseModel):
    success: bool
    message: str
    guardian_user_id: str
    elder_user_id: str
    sender_role: str
    created_at: datetime

class LetterItem(BaseModel):
    guardian_user_id: str
    elder_user_id: str
    content: str
    created_at: datetime
    sender_role: str

class LetterListResponse(BaseModel):
    success: bool
    letters: list[LetterItem]
