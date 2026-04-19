import re

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

    if _looks_like_nearby_hospital_request(normalized):
        return "nearby_hospital_request"

    if _looks_like_hospital_visit_request(normalized):
        return "hospital_visit_support"

    if _looks_like_symptom_support_request(normalized):
        return "symptom_support"

    if _looks_like_medication_request(normalized):
        return "lookup_medication"

    if any(keyword in normalized for keyword in ("일정", "약속", "병원", "예약", "등록", "추가", "넣어")):
        if any(keyword in normalized for keyword in ("등록", "추가", "넣어", "잡아")):
            return "create_schedule"
        return "lookup_schedule"

    if _looks_like_web_search_request(normalized):
        return "web_search_request"

    if any(keyword in normalized for keyword in ("심심", "적적", "외롭", "말동무")):
        return "small_talk"

    return "general_support"


def _looks_like_nearby_hospital_request(text: str) -> bool:
    if "병원" not in text and "응급실" not in text:
        return False

    return any(keyword in text for keyword in ("주변", "근처", "가까운", "찾아", "알아봐", "있는지"))


def _looks_like_hospital_visit_request(text: str) -> bool:
    if "병원" not in text and "응급실" not in text:
        return False

    visit_keywords = (
        "가고 싶",
        "가고싶",
        "가야",
        "가자",
        "가려고",
        "데려다",
        "데려가",
        "응급실",
        "오늘 지금",
        "지금",
    )
    schedule_keywords = (
        "일정",
        "예약",
        "몇 시",
        "몇시",
        "오전",
        "오후",
        "내일 병원 일정",
        "오늘 병원 일정",
        "병원 일정",
        "등록",
        "추가",
        "넣어",
        "잡아",
    )

    if any(keyword in text for keyword in schedule_keywords):
        return False

    return any(keyword in text for keyword in visit_keywords)


def _looks_like_medication_request(text: str) -> bool:
    medication_patterns = (
        r"복약",
        r"약시간",
        r"혈압약",
        r"감기약",
        r"당뇨약",
        r"약 먹",
        r"드실 약",
        r"먹었",
        r"먹어",
        r"드셨어",
        r"(?<!예)약[은는이가을를도만]",
        r"(?<!예)약\s",
        r"\s약",
    )
    return any(re.search(pattern, text) for pattern in medication_patterns)


def _looks_like_symptom_support_request(text: str) -> bool:
    symptom_keywords = (
        "아파",
        "두통",
        "머리",
        "어지러",
        "속이",
        "메스껍",
        "토할",
        "배가",
        "가슴",
        "숨이",
        "기침",
        "열이",
        "몸살",
        "춥",
        "떨려",
    )
    return any(keyword in text for keyword in symptom_keywords)


def _looks_like_web_search_request(text: str) -> bool:
    search_keywords = (
        "검색해",
        "검색해줘",
        "검색해 줄래",
        "알아봐",
        "알아봐줘",
        "찾아줘",
        "찾아봐",
        "찾아보",
    )
    return any(keyword in text for keyword in search_keywords)
