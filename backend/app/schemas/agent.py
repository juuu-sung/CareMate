from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.chat import CareMode, ChatIntent


AgentAction = Literal[
    "lookup_schedule",
    "lookup_medication",
    "check_mode",
    "create_schedule",
    "send_guardian_message",
    "mark_medication_taken",
    "change_mode",
    "hospital_visit_support",
    "nearby_hospital_request",
    "symptom_support",
    "small_talk",
    "general_support",
    "needs_clarification",
    "web_search_request",
]


class AgentSlots(BaseModel):
    title: str | None = None
    date: str | None = None
    time: str | None = None
    date_range: str | None = None
    time_scope: str | None = None
    raw_text: str | None = None
    

    target: str | None = None
    content: str | None = None

    medication_name: str | None = None
    status: str | None = None

    target_mode: CareMode | None = None


class AgentSessionState(BaseModel):
    session_id: str
    mode: CareMode = "basic"
    pending_action: AgentAction | None = None
    slots: AgentSlots = Field(default_factory=AgentSlots)
    awaiting_confirmation: bool = False
    last_requested_slot: str | None = None


class AgentHandleResult(BaseModel):
    action: AgentAction
    message: str
    requires_confirmation: bool = False
    completed: bool = False
    data: dict | None = None


class AgentParsedInput(BaseModel):
    action: AgentAction
    slots: AgentSlots
    missing_slots: list[str] = Field(default_factory=list)
    confirmation_question: str | None = None
    missing_slot_question: str | None = None


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


