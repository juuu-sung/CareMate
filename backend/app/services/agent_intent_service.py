import re

from app.schemas.agent import AgentAction


EXACT_TIME_PATTERN = re.compile(
    r"((오전|오후)\s*\d{1,2}시(?:\s*\d{1,2}분)?|\d{1,2}시(?:\s*\d{1,2}분)?)"
)

BROAD_TIME_PATTERN = re.compile(
    r"(오전|오후|아침|점심|낮|저녁|밤)"
)

DATE_PATTERN = re.compile(
    r"(오늘|내일|모레|글피|이번주\s*[월화수목금토일]요일?|다음주\s*[월화수목금토일]요일?|[월화수목금토일]요일?)"
)


def classify_agent_action(
    text: str,
    current_pending_action: AgentAction | None = None,
    awaiting_confirmation: bool = False,
    last_requested_slot: str | None = None,
) -> AgentAction:
    normalized = _normalize_text(text)

    if not normalized:
        return "needs_clarification"

    # 1. 확인 응답은 현재 진행 중인 액션을 유지
    if awaiting_confirmation and current_pending_action:
        if _looks_like_confirmation_response(normalized):
            return current_pending_action
        if _looks_like_rejection_response(normalized):
            return current_pending_action

    # 2. 일정 등록/수정 질문 직후의 짧은 후속 응답은 create_schedule로 우선 처리
    if current_pending_action == "create_schedule":
        if _looks_like_schedule_followup_response(normalized, last_requested_slot):
            return "create_schedule"

    # 3. 모드 관련
    if any(keyword in normalized for keyword in ("모드", "인지 지원", "건강 관리")):
        if any(keyword in normalized for keyword in ("바꿔", "변경", "전환", "해줘")):
            return "change_mode"
        return "check_mode"

    # 4. 보호자 메시지
    if any(keyword in normalized for keyword in ("편지", "메시지")):
        return "send_guardian_message"

    if any(keyword in normalized for keyword in ("보내", "전해")):
        # 일정 관련 표현이 아니면 보호자 메시지 쪽 우선
        if not _looks_like_schedule_request(normalized):
            return "send_guardian_message"

    # 5. 복약 기록
    if any(keyword in normalized for keyword in ("기록", "체크")) and any(
        keyword in normalized for keyword in ("약", "복약", "먹었", "복용")
    ):
        return "mark_medication_taken"

    # 6. 병원/응급 관련
    if _looks_like_nearby_hospital_request(normalized):
        return "nearby_hospital_request"

    if _looks_like_hospital_visit_request(normalized):
        return "hospital_visit_support"

    # 7. 증상 지원
    if _looks_like_symptom_support_request(normalized):
        return "symptom_support"

    # 8. 약 조회
    if _looks_like_medication_request(normalized):
        return "lookup_medication"

    # 9. 일정 관련
    if _looks_like_schedule_create_request(normalized):
        return "create_schedule"

    if _looks_like_schedule_lookup_request(normalized):
        return "lookup_schedule"

    # 10. 웹 검색
    if _looks_like_web_search_request(normalized):
        return "web_search_request"

    # 11. 잡담
    if any(keyword in normalized for keyword in ("심심", "적적", "외롭", "말동무")):
        return "small_talk"

    return "general_support"


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def _looks_like_schedule_followup_response(text: str, last_requested_slot: str | None) -> bool:
    # 일정 등록 진행 중, 사용자가 짧게 필요한 슬롯만 답하는 경우
    if len(text) <= 1:
        return False

    if last_requested_slot == "time":
        if _contains_time_expression(text):
            return True

    if last_requested_slot == "date":
        if _contains_date_expression(text):
            return True

    if last_requested_slot == "title":
        # 제목은 범용이라 너무 넓게 잡지 않되, 짧은 단답도 허용
        if not _contains_other_domain_keywords(text):
            return True

    # last_requested_slot 정보가 없어도 일정 follow-up처럼 보이는 경우
    if _contains_time_expression(text) or _contains_date_expression(text):
        return True

    if text in {"응", "그래", "맞아", "예", "네", "좋아", "좋습니다"}:
        return True

    return False


def _looks_like_confirmation_response(text: str) -> bool:
    positives = (
        "응",
        "그래",
        "맞아",
        "예",
        "네",
        "좋아",
        "좋습니다",
        "해주세요",
        "해줘",
        "해",
        "맞습니다",
        "그렇게 해줘",
        "그렇게 해",
        "등록해줘",
        "추가해줘",
    )
    return any(phrase == text or phrase in text for phrase in positives)


def _looks_like_rejection_response(text: str) -> bool:
    negatives = (
        "아니",
        "아니야",
        "아뇨",
        "아니요",
        "취소",
        "취소해",
        "취소해줘",
        "하지마",
        "하지 마",
        "그건 아니야",
    )
    return any(phrase == text or phrase in text for phrase in negatives)


def _looks_like_schedule_request(text: str) -> bool:
    return _looks_like_schedule_create_request(text) or _looks_like_schedule_lookup_request(text)


def _looks_like_schedule_create_request(text: str) -> bool:
    create_keywords = (
        "등록",
        "추가",
        "넣어",
        "잡아",
        "기억해줘",
        "기록해줘",
        "적어줘",
        "만들어",
        "예약해",
        "예약 잡아",
    )
    schedule_targets = (
        "일정",
        "약속",
        "병원",
        "예약",
        "진료",
        "모임",
        "방문",
    )

    # 명시적으로 일정 생성 의도가 있는 경우
    if any(keyword in text for keyword in create_keywords) and any(
        target in text for target in schedule_targets
    ):
        return True

    # "내일 병원 가야 해", "금요일 주민센터 가야 한다" 같이 생성성 발화
    if _contains_date_expression(text) or _contains_time_expression(text):
        if any(
            phrase in text
            for phrase in (
                "가야 해",
                "가야해",
                "가야 돼",
                "가야돼",
                "가야 한다",
                "가야한다",
                "다녀와야 해",
                "다녀와야해",
                "다녀와야 한다",
                "다녀와야한다",
                "약속",
                "병원",
                "진료",
                "방문",
            )
        ):
            return True

    # "병원 예약 넣어줘", "내일 일정 하나 추가해줘"
    if any(target in text for target in schedule_targets) and any(
        keyword in text for keyword in create_keywords
    ):
        return True

    return False


def _looks_like_schedule_lookup_request(text: str) -> bool:
    lookup_keywords = (
        "뭐 있",
        "뭐 있어",
        "뭐 있나",
        "보여줘",
        "알려줘",
        "확인",
        "조회",
        "어떤 일정",
        "일정 뭐",
        "약속 뭐",
    )

    schedule_keywords = (
        "일정",
        "약속",
        "예약",
    )

    date_keywords = (
        "오늘",
        "내일",
        "모레",
        "이번주",
        "다음주",
    )

    if any(keyword in text for keyword in schedule_keywords) and any(
        keyword in text for keyword in lookup_keywords
    ):
        return True

    if any(date_keyword in text for date_keyword in date_keywords) and any(
        keyword in text for keyword in ("일정", "약속", "예약")
    ):
        if any(keyword in text for keyword in ("뭐", "있", "보여", "알려", "확인", "조회")):
            return True

    return False


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
        r"복용",
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


def _contains_time_expression(text: str) -> bool:
    return bool(EXACT_TIME_PATTERN.search(text) or BROAD_TIME_PATTERN.search(text))


def _contains_date_expression(text: str) -> bool:
    return bool(DATE_PATTERN.search(text))


def _contains_other_domain_keywords(text: str) -> bool:
    other_domain_keywords = (
        "병원 어디",
        "근처 병원",
        "응급실",
        "약 뭐",
        "무슨 약",
        "복약",
        "모드",
        "인지 지원",
        "건강 관리",
        "검색해",
        "찾아줘",
        "아파",
        "두통",
        "기침",
        "열이",
    )
    return any(keyword in text for keyword in other_domain_keywords)