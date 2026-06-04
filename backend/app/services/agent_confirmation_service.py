from app.schemas.agent import AgentAction, AgentSlots


def build_confirmation_question(action: AgentAction, slots: AgentSlots) -> str | None:
    if action == "create_schedule" and slots.date and slots.time and slots.title:
        return f"{slots.date} {slots.time}에 {slots.title}으로 추가할까요?"
    if action == "create_medication" and slots.medication_name and slots.time:
        return f"{slots.time}에 {slots.medication_name} 복약을 등록할까요?"
    if action == "send_guardian_message" and slots.target and slots.content:
        return f"{slots.target}에게 '{slots.content}'라고 보낼까요?"
    if action == "mark_medication_taken" and slots.medication_name and slots.time_scope:
        return f"{slots.time_scope} {slots.medication_name}을 드신 것으로 기록할까요?"
    if action == "request_location_refresh":
        return "부모님께 현재 위치 갱신 요청을 보낼까요?"
    if action == "change_mode" and slots.target_mode:
        mode_label = {
            "basic": "기본 모드",
            "cognitive_support": "인지 지원 모드",
            "health_support": "건강 관리 모드",
        }[slots.target_mode]
        return f"{mode_label}로 바꿀까요?"
    return None


def build_missing_slot_question(action: AgentAction, missing_slots: list[str]) -> str | None:
    if not missing_slots:
        return None

    first_missing = missing_slots[0]

    if action == "lookup_schedule" and first_missing == "date_range":
        return "오늘 일정인지, 내일 일정인지 말씀해 주세요."
    if action == "lookup_medication" and first_missing == "time_scope":
        return "지금 드실 약을 볼까요, 오늘 전체 약을 볼까요?"
    if action == "create_schedule":
        return {
            "title": "어떤 일정으로 등록할까요?",
            "date": "언제 일정으로 잡을까요?",
            "time": "몇 시로 잡을까요?",
        }.get(first_missing)
    if action == "create_medication":
        return {
            "medication_name": "어떤 약을 등록할까요?",
            "time": "몇 시에 드실 약으로 등록할까요?",
        }.get(first_missing)
    if action == "send_guardian_message":
        return {
            "target": "누구에게 보낼지 말씀해 주세요.",
            "content": "어떤 내용을 보낼지 말씀해 주세요.",
        }.get(first_missing)
    if action == "mark_medication_taken":
        return {
            "medication_name": "어떤 약인지 말씀해 주세요.",
            "time_scope": "아침 약인지, 저녁 약인지 말씀해 주세요.",
            "status": "드신 것으로 기록할지 다시 말씀해 주세요.",
        }.get(first_missing)
    if action == "change_mode" and first_missing == "target_mode":
        return "기본, 인지 지원, 건강 관리 중 어떤 모드로 바꿀까요?"

    return "조금 더 자세히 말씀해 주세요."
