from typing import Literal

from pydantic import BaseModel, Field

CareMode = Literal["basic", "cognitive_support", "health_support"]
RequesterRole = Literal["parent", "guardian"]
ChatIntent = Literal[
    "schedule_lookup",
    "medication_lookup",
    "health_status_lookup",
    "hospital_visit_support",
    "nearby_hospital_request",
    "symptom_support",
    "web_search_support",
    "small_talk",
    "general_support",
    "needs_clarification",
]
TranscriptVisibility = Literal["always", "on_low_confidence", "hidden"]


class ChatMessageRequest(BaseModel):
    text: str
    mode: CareMode = "basic"
    context_source: Literal["text"] = "text"
    client_message_id: str | None = None
    session_id: str | None = None
    elder_user_id: str | None = Field(default=None, min_length=1)
    requester_role: RequesterRole = "parent"
    link_code: str | None = Field(default=None, min_length=1)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class ChatPlaceItem(BaseModel):
    name: str
    distance_meters: int = Field(ge=0)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address: str | None = None
    phone: str | None = None
    place_url: str | None = None
    available_beds: int | None = Field(default=None, ge=0)


class ChatSourceItem(BaseModel):
    title: str
    url: str


class ChatPlaceStatusRequest(BaseModel):
    place_name: str
    address: str | None = None
    phone: str | None = None
    place_url: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class ChatPlaceStatusResponse(BaseModel):
    answer: str
    sources: list[ChatSourceItem] = Field(default_factory=list)


class ChatResponseBase(BaseModel):
    answer: str
    confirmation_needed: bool = False
    clarification_question: str | None = None
    transcript: str
    intent: ChatIntent
    mode: CareMode
    session_id: str | None = None
    pending_action: str | None = None
    awaiting_confirmation: bool = False
    missing_slots: list[str] = Field(default_factory=list)
    executed_action: str | None = None
    places: list[ChatPlaceItem] = Field(default_factory=list)
    sources: list[ChatSourceItem] = Field(default_factory=list)


class ChatMessageResponse(ChatResponseBase):
    provider: str = "stub"
    llm_latency_ms: int | None = None
    total_latency_ms: int | None = None


class ChatSpeechRequest(BaseModel):
    mode: CareMode = "basic"
    audio_format: Literal["m4a", "wav", "mp3", "webm"] = "m4a"
    audio_duration_ms: int | None = Field(default=None, ge=0)
    client_message_id: str | None = None
    session_id: str | None = None
    elder_user_id: str | None = Field(default=None, min_length=1)
    requester_role: RequesterRole = "parent"
    link_code: str | None = Field(default=None, min_length=1)
    transcript_visibility: TranscriptVisibility = "on_low_confidence"
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class ChatSpeechResponse(ChatResponseBase):
    stt_confidence: float = Field(ge=0.0, le=1.0)
    stt_provider: str = "stub"
    llm_provider: str = "stub"
    stt_latency_ms: int | None = None
    llm_latency_ms: int | None = None
    total_latency_ms: int | None = None


class ChatHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    mode: CareMode
    created_at: str
    requester_role: RequesterRole = "parent"


class ChatHistoryResponse(BaseModel):
    items: list[ChatHistoryItem]
