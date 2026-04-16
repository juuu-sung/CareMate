from dataclasses import dataclass

from app.schemas.agent import AgentPlan
from app.schemas.chat import CareMode, ChatPlaceItem
from app.services.emergency_room_service import EmergencyRoomServiceError, get_realtime_emergency_room_result
from app.services.nearby_hospital_service import (
    NearbyHospitalServiceError,
    get_nearby_hospital_result,
)


@dataclass(frozen=True)
class ResponsePolicyDecision:
    answer: str | None = None
    use_llm: bool = False
    grounded_hint: str | None = None
    places: list[ChatPlaceItem] | None = None


def build_response_policy(
    agent_plan: AgentPlan,
    text: str,
    mode: CareMode,
    latitude: float | None = None,
    longitude: float | None = None,
) -> ResponsePolicyDecision:
    if agent_plan.intent == "schedule_lookup":
        answer = _build_schedule_answer(mode)
        return ResponsePolicyDecision(answer=answer, grounded_hint=answer)

    if agent_plan.intent == "medication_lookup":
        answer = _build_medication_answer(mode)
        return ResponsePolicyDecision(answer=answer, grounded_hint=answer)

    if agent_plan.intent == "hospital_visit_support":
        return ResponsePolicyDecision(answer=_build_hospital_visit_response(text))

    if agent_plan.intent == "nearby_hospital_request":
        if "응급실" in text:
            try:
                answer, hospitals = get_realtime_emergency_room_result(latitude, longitude)
                return ResponsePolicyDecision(answer=answer, places=_to_chat_places(hospitals))
            except EmergencyRoomServiceError:
                pass
        try:
            answer, hospitals = get_nearby_hospital_result(
                latitude,
                longitude,
                emergency_only="응급실" in text,
            )
            return ResponsePolicyDecision(answer=answer, places=_to_chat_places(hospitals))
        except NearbyHospitalServiceError:
            return ResponsePolicyDecision(answer=_build_nearby_hospital_fallback_response(text))

    if agent_plan.intent == "symptom_support":
        return ResponsePolicyDecision(answer=_build_symptom_support_response(text))

    if agent_plan.action == "check_mode":
        return ResponsePolicyDecision(answer=_build_mode_answer(mode))

    if agent_plan.intent == "small_talk":
        return ResponsePolicyDecision(use_llm=True)

    return ResponsePolicyDecision(use_llm=True)


def _build_schedule_answer(mode: CareMode) -> str:
    if mode == "cognitive_support":
        return "오늘 3시에 병원 가요. 아직 시간 있어요."
    if mode == "health_support":
        return "오늘 오후 3시에 병원 일정이 있어요. 약 복용 일정도 함께 확인해드릴까요?"
    return "오늘 오후 3시에 병원 일정이 있어요."


def _build_medication_answer(mode: CareMode) -> str:
    if mode == "cognitive_support":
        return "다음 약은 저녁 8시에 드시면 돼요."
    if mode == "health_support":
        return "다음 약은 저녁 8시에 드시면 돼요. 복용 확인도 같이 도와드릴까요?"
    return "다음 약은 저녁 8시에 드시면 돼요."


def _build_hospital_visit_response(text: str) -> str:
    lowered = text.strip().lower()

    if "응급실" in lowered:
        return "응급실에 가고 싶으시군요. 많이 급하시면 바로 119나 주변 도움을 요청해 주세요. 어디가 가장 불편한지 말씀해 주세요."

    return "지금 병원에 가고 싶으시군요. 많이 아프시면 바로 보호자나 주변 도움을 요청해 주세요. 어디가 가장 불편한지 말씀해 주세요."


def _build_nearby_hospital_fallback_response(text: str) -> str:
    if "응급실" in text:
        return "주변 응급실을 찾는 중 문제가 생겼어요. 많이 급하시면 119에 바로 연락해 주세요."
    return "주변 병원을 찾는 중 문제가 생겼어요. 잠시 후 다시 말씀해 주세요. 많이 불편하시면 119나 보호자에게 바로 도움을 요청해 주세요."


def _build_symptom_support_response(text: str) -> str:
    lowered = text.strip().lower()

    if any(keyword in lowered for keyword in ("가슴", "숨이", "숨차", "숨이 차", "호흡")):
        return "가슴이 답답하거나 숨이 차시군요. 지금은 바로 앉아서 쉬시고 주변 도움을 요청해 주세요. 많이 심하면 119에 바로 연락해 주세요."

    if any(keyword in lowered for keyword in ("머리", "두통")):
        return "머리가 아프시군요. 우선 조용한 곳에서 잠깐 쉬어보세요. 어지럽거나 열도 있나요?"

    if any(keyword in lowered for keyword in ("어지러", "빙글", "휘청")):
        return "어지러우시군요. 우선 앉거나 누워서 쉬세요. 계속 어지럽거나 토할 것 같나요?"

    if any(keyword in lowered for keyword in ("배", "속이", "메스껍", "토할", "설사")):
        return "배가 불편하시군요. 우선 잠깐 쉬면서 물을 조금만 드셔보세요. 토하거나 열도 있나요?"

    if any(keyword in lowered for keyword in ("기침", "열", "몸살", "춥", "떨려")):
        return "몸이 불편하시군요. 우선 따뜻하게 쉬어보세요. 열이 나거나 숨이 차지는 않나요?"

    return "많이 불편하시군요. 우선 잠깐 쉬어보세요. 어디가 가장 불편한지 말씀해 주세요."


def _build_mode_answer(mode: CareMode) -> str:
    if mode == "cognitive_support":
        return "지금은 인지 지원 모드예요."
    if mode == "health_support":
        return "지금은 건강 관리 모드예요."
    return "지금은 기본 모드예요."


def _to_chat_places(hospitals: list) -> list[ChatPlaceItem]:
    return [
        ChatPlaceItem(
            name=hospital.name,
            distance_meters=hospital.distance_meters,
            latitude=hospital.latitude,
            longitude=hospital.longitude,
            address=hospital.address,
            phone=hospital.phone,
            place_url=hospital.place_url,
            available_beds=hospital.available_beds,
        )
        for hospital in hospitals
    ]
