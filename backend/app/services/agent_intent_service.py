from app.schemas.agent import AgentAction


def classify_agent_action(text: str) -> AgentAction:
    normalized = text.strip().lower()

    if len(normalized) < 2:
        return "needs_clarification"

    if any(keyword in normalized for keyword in ("모드", "인지 지원", "건강 관리")):
        if any(keyword in normalized for keyword in ("바꿔", "변경", "전환", "해줘")):
            return "change_mode"
        return "check_mode"

    if any(keyword in normalized for keyword in ("편지", "보내", "전해", "메시지")):
        return "send_guardian_message"

    if any(keyword in normalized for keyword in ("기록", "체크")) and any(
        keyword in normalized for keyword in ("약", "복약", "먹었")
    ):
        return "mark_medication_taken"

    if any(keyword in normalized for keyword in ("약", "복약", "먹으면", "먹어", "약시간")):
        return "lookup_medication"

    if any(keyword in normalized for keyword in ("일정", "약속", "병원", "예약", "등록", "추가", "넣어")):
        if any(keyword in normalized for keyword in ("등록", "추가", "넣어", "잡아")):
            return "create_schedule"
        return "lookup_schedule"

    if any(keyword in normalized for keyword in ("심심", "적적", "외롭", "말동무")):
        return "small_talk"

    return "general_support"
