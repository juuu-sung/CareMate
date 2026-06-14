from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class HeartRateCreateRequest(BaseModel):
    elder_user_id: str = Field(..., description="노인 사용자 ID")
    heart_rate: float = Field(..., ge=20, le=250, description="심박수 bpm")
    measured_at: datetime = Field(..., description="측정 시간")
    source: Optional[str] = Field(default="Apple Watch", description="데이터 출처")


class HeartRateResponse(BaseModel):
    id: str
    elder_user_id: str
    heart_rate: float
    measured_at: datetime
    source: Optional[str] = None

    class Config:
        from_attributes = True


class HeartRateLatestResponse(BaseModel):
    elder_user_id: str
    heart_rate: Optional[float] = None
    measured_at: Optional[datetime] = None
    source: Optional[str] = None
    status: str
    message: str


class HeartRateHistoryItem(BaseModel):
    heart_rate: float
    measured_at: datetime
    source: Optional[str] = None


class HeartRateHistoryResponse(BaseModel):
    elder_user_id: str
    hours: int
    items: List[HeartRateHistoryItem]