from app.schemas.agent import AgentPlan
from app.schemas.chat import CareMode, ChatIntent
from app.services.agent_confirmation_service import build_confirmation_question, build_missing_slot_question
from app.services.agent_intent_service import classify_agent_action
from app.services.agent_slot_service import extract_agent_slots, find_missing_slots

ACTION_TO_INTENT: dict[str, ChatIntent] = {
    "lookup_schedule": "schedule_lookup",
    "lookup_medication": "medication_lookup",
    "check_mode": "general_support",
    "create_schedule": "general_support",
    "send_guardian_message": "general_support",
    "mark_medication_taken": "medication_lookup",
    "change_mode": "general_support",
    "hospital_visit_support": "hospital_visit_support",
    "nearby_hospital_request": "nearby_hospital_request",
    "symptom_support": "symptom_support",
    "small_talk": "small_talk",
    "general_support": "general_support",
    "needs_clarification": "needs_clarification",
}


def build_agent_plan(text: str, mode: CareMode) -> AgentPlan:
    action = classify_agent_action(text)
    slots = extract_agent_slots(action, text)
    missing_slots = find_missing_slots(action, slots)
    requires_confirmation = action in {
        "create_schedule",
        "send_guardian_message",
        "mark_medication_taken",
        "change_mode",
    }
    clarification_question = build_missing_slot_question(action, missing_slots)

    if not clarification_question and requires_confirmation:
        clarification_question = build_confirmation_question(action, slots)

    return AgentPlan(
        action=action,
        intent=action_to_intent(action),
        slots=slots,
        missing_slots=missing_slots,
        requires_confirmation=requires_confirmation,
        awaiting_confirmation=bool(requires_confirmation and not missing_slots and clarification_question),
        clarification_question=clarification_question,
        pending_action=action if requires_confirmation else None,
        executed_action=None,
    )


def action_to_intent(action: str) -> ChatIntent:
    return ACTION_TO_INTENT[action]
