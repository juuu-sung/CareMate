from datetime import date as DateType
from typing import Optional

from pydantic import BaseModel, Field


class DailyHealthItem(BaseModel):
    date: str
    cognitive_score: Optional[float] = None
    cognitive_wav_score: Optional[float] = None
    cognitive_text_score: Optional[float] = None
    depression_score: Optional[float] = None
    insomnia_score: Optional[float] = None
    utterance_count: int = 0
    text_analysis_count: int = 0
    has_data: bool = False


class DailyHealthAnalysisResponse(BaseModel):
    elder_user_id: str
    start_date: str
    end_date: str
    items: list[DailyHealthItem] = Field(default_factory=list)


class UtteranceHealthItem(BaseModel):
    id: str
    recorded_at: Optional[str] = None
    session_id: Optional[str] = None
    depression_score: Optional[float] = None
    insomnia_score: Optional[float] = None
    cognitive_score: Optional[float] = None
    cognitive_text_score: Optional[float] = None
    transcript_preview: Optional[str] = None


class UtteranceHealthAnalysisResponse(BaseModel):
    elder_user_id: str
    items: list[UtteranceHealthItem] = Field(default_factory=list)
