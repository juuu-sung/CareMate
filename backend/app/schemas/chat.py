from typing import Literal

from pydantic import BaseModel, Field

CareMode = Literal["basic", "cognitive_support", "health_support"]
ChatIntent = Literal[
    "schedule_lookup",
    "medication_lookup",
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
    transcript_visibility: TranscriptVisibility = "on_low_confidence"


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


class ChatHistoryResponse(BaseModel):
    items: list[ChatHistoryItem]
