from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.chat import CareMode, ChatIntent

AgentAction = Literal[
    "lookup_schedule",
    "lookup_medication",
    "lookup_health_status",
    "check_mode",
    "create_schedule",
    "send_guardian_message",
    "mark_medication_taken",
    "change_mode",
    "hospital_visit_support",
    "nearby_hospital_request",
    "symptom_support",
    "web_search_request",
    "small_talk",
    "general_support",
    "needs_clarification",
]


class AgentSlots(BaseModel):
    date_range: str | None = None
    date: str | None = None
    time: str | None = None
    time_scope: str | None = None
    title: str | None = None
    target: str | None = None
    content: str | None = None
    medication_name: str | None = None
    status: str | None = None
    target_mode: CareMode | None = None


class AgentPlan(BaseModel):
    action: AgentAction
    intent: ChatIntent
    slots: AgentSlots = Field(default_factory=AgentSlots)
    missing_slots: list[str] = Field(default_factory=list)
    requires_confirmation: bool = False
    awaiting_confirmation: bool = False
    clarification_question: str | None = None
    pending_action: AgentAction | None = None
    executed_action: AgentAction | None = None


class AgentSessionState(BaseModel):
    session_id: str
    mode: CareMode
    pending_action: AgentAction
    slots: AgentSlots = Field(default_factory=AgentSlots)
    awaiting_confirmation: bool = False
