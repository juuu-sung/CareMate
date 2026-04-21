from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.schemas.agent import AgentPlan
from app.schemas.chat import CareMode, ChatPlaceItem, RequesterRole
from app.services.emergency_room_service import EmergencyRoomServiceError, get_realtime_emergency_room_result
from app.services.guardian_service import get_guardian_dashboard_snapshot
from app.services.medication_service import list_medication_items
from app.services.nearby_hospital_service import (
    NearbyHospitalServiceError,
    get_nearby_hospital_result,
)
from app.services.schedule_service import list_schedules


SEOUL_TZ = ZoneInfo("Asia/Seoul")
WEEKDAY_LABELS = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]


@dataclass(frozen=True)
class ResponsePolicyDecision:
    answer: str | None = None
    use_llm: bool = False
    grounded_hint: str | None = None
    places: list[ChatPlaceItem] | None = None


def build_response_policy(
    db: Session,
    agent_plan: AgentPlan,
    text: str,
    mode: CareMode,
    elder_user_id: str | None,
    requester_role: RequesterRole,
    link_code: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
) -> ResponsePolicyDecision:
    if agent_plan.intent == "schedule_lookup":
        schedule_items = list_schedules(db, elder_user_id)
        filtered_schedule_items = _filter_schedule_items(schedule_items, agent_plan.slots.date_range)
        answer = _build_schedule_answer(
            filtered_items=filtered_schedule_items,
            date_range=agent_plan.slots.date_range,
            requester_role=requester_role,
        )
        grounded_hint = _build_schedule_grounded_hint(
            filtered_items=filtered_schedule_items,
            date_range=agent_plan.slots.date_range,
            requester_role=requester_role,
        )
        return ResponsePolicyDecision(answer=answer, grounded_hint=grounded_hint, use_llm=True)

    if agent_plan.intent == "medication_lookup":
        medication_items = list_medication_items(db, elder_user_id)
        filtered_medication_items = _filter_medication_items(medication_items, agent_plan.slots.time_scope)
        answer = _build_medication_answer(
            filtered_items=filtered_medication_items,
            time_scope=agent_plan.slots.time_scope,
            requester_role=requester_role,
        )
        grounded_hint = _build_medication_grounded_hint(
            filtered_items=filtered_medication_items,
            time_scope=agent_plan.slots.time_scope,
            requester_role=requester_role,
        )
        return ResponsePolicyDecision(answer=answer, grounded_hint=grounded_hint, use_llm=True)

    if agent_plan.intent == "health_status_lookup":
        dashboard = get_guardian_dashboard_snapshot(db, elder_user_id) if elder_user_id else None
        answer = _build_health_status_answer(
            elder_user_id=elder_user_id,
            requester_role=requester_role,
            dashboard=dashboard,
        )
        grounded_hint = _build_health_status_grounded_hint(
            elder_user_id=elder_user_id,
            requester_role=requester_role,
            dashboard=dashboard,
        )
        return ResponsePolicyDecision(answer=answer, grounded_hint=grounded_hint, use_llm=True)

    if agent_plan.intent == "hospital_visit_support":
        return ResponsePolicyDecision(
            answer=_build_hospital_visit_response(text, requester_role)
        )

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
            return ResponsePolicyDecision(
                answer=_build_nearby_hospital_fallback_response(text, requester_role)
            )

    if agent_plan.intent == "symptom_support":
        return ResponsePolicyDecision(
            answer=_build_symptom_support_response(text, requester_role)
        )

    if agent_plan.action == "check_mode":
        return ResponsePolicyDecision(answer=_build_mode_answer(mode, requester_role))

    if agent_plan.intent == "small_talk":
        return ResponsePolicyDecision(use_llm=True)

    return ResponsePolicyDecision(use_llm=True)


def _build_schedule_answer(
    filtered_items: list[dict[str, str]],
    date_range: str | None,
    requester_role: RequesterRole,
) -> str:
    label = date_range or "가까운"

    if not filtered_items:
        if requester_role == "guardian":
            return f"부모님은 {label} 일정이 없어요."
        return f"{label} 일정은 없어요."

    next_item = filtered_items[0]

    if len(filtered_items) == 1:
        if requester_role == "guardian":
            return (
                f"부모님은 {next_item['date']} {next_item['time']}에 "
                f"{next_item['title']} 일정이 있어요."
            )
        return f"{next_item['date']} {next_item['time']}에 {next_item['title']} 일정이 있어요."

    if requester_role == "guardian":
        return (
            f"부모님은 {label} 일정이 {len(filtered_items)}건 있어요. "
            f"가장 가까운 일정은 {next_item['time']} {next_item['title']}이에요."
        )

    return (
        f"{label} 일정이 {len(filtered_items)}건 있어요. "
        f"가장 가까운 일정은 {next_item['time']} {next_item['title']}이에요."
    )


def _build_medication_answer(
    filtered_items,
    time_scope: str | None,
    requester_role: RequesterRole,
) -> str:
    if not filtered_items:
        if requester_role == "guardian":
            return "부모님 복약 정보가 아직 등록되지 않았어요."
        return "복약 정보가 아직 등록되지 않았어요."

    if time_scope and time_scope not in {"오늘", "지금"}:
        first_item = filtered_items[0]
        if requester_role == "guardian":
            return (
                f"부모님 {time_scope} 약은 {first_item.name}이고 "
                f"현재 기록은 {first_item.status_label}이에요."
            )
        return f"{time_scope} 약은 {first_item.name}이고 현재 기록은 {first_item.status_label}이에요."

    taken_count = sum(1 for item in filtered_items if item.status == "taken")
    pending_count = sum(1 for item in filtered_items if item.status != "taken")
    next_item = next(
        (item for item in filtered_items if item.status != "taken"),
        filtered_items[0],
    )

    if pending_count == 0:
        if requester_role == "guardian":
            return "부모님 오늘 약은 모두 복용 완료로 기록돼 있어요."
        return "오늘 약은 모두 복용 완료로 기록돼 있어요."

    if requester_role == "guardian":
        return (
            f"부모님은 오늘 복약 {len(filtered_items)}건 중 {taken_count}건이 완료됐어요. "
            f"아직 확인이 필요한 약은 {pending_count}건이고 "
            f"가장 가까운 약은 {next_item.time} {next_item.name}이에요."
        )

    return (
        f"오늘 복약 {len(filtered_items)}건 중 {taken_count}건이 완료됐어요. "
        f"아직 확인이 필요한 약은 {pending_count}건이고 "
        f"가장 가까운 약은 {next_item.time} {next_item.name}이에요."
    )


def _build_health_status_answer(
    elder_user_id: str | None,
    requester_role: RequesterRole,
    dashboard: dict | None,
) -> str:
    if not elder_user_id:
        if requester_role == "guardian":
            return "부모님 상태를 확인할 연결 정보가 없어요."
        return "지금 상태를 확인할 연결 정보가 없어요."

    if not dashboard:
        if requester_role == "guardian":
            return "부모님 상태를 아직 확인하지 못했어요."
        return "지금 상태를 아직 확인하지 못했어요."

    care_level = _health_status_level(dashboard)
    care_score = dashboard.get("care_score", 0)
    reason_preview = _format_care_reason_preview(dashboard.get("care_reasons", []))

    if care_level == "주의 필요":
        if requester_role == "guardian":
            return (
                f"부모님 오늘 돌봄 점수는 {care_score}점으로 주의 단계예요. "
                f"{reason_preview} "
                f"체크인 상태는 {_format_check_in_status(dashboard['check_in_status'])}이에요."
            )
        return (
            f"오늘 돌봄 점수는 {care_score}점으로 확인이 더 필요해요. "
            f"{reason_preview} "
            f"체크인 상태는 {_format_check_in_status(dashboard['check_in_status'])}예요."
        )

    if care_level == "확인 필요":
        if requester_role == "guardian":
            return (
                f"부모님 오늘 돌봄 점수는 {care_score}점으로 확인 단계예요. "
                f"{reason_preview}"
            )
        return (
            f"오늘 돌봄 점수는 {care_score}점으로 확인 단계예요. "
            f"{reason_preview}"
        )

    if requester_role == "guardian":
        return (
            f"부모님 오늘 돌봄 점수는 {care_score}점으로 안정 단계예요. "
            f"{reason_preview}"
        )

    return (
        f"오늘 돌봄 점수는 {care_score}점으로 안정 단계예요. "
        f"{reason_preview}"
    )


def _build_schedule_grounded_hint(
    filtered_items: list[dict[str, str]],
    date_range: str | None,
    requester_role: RequesterRole,
) -> str:
    label = date_range or "가까운 일정"
    lines = [
        "[일정 조회 사실]",
        f"- 요청 범위: {label}",
        f"- 사용자 역할: {'guardian' if requester_role == 'guardian' else 'parent'}",
    ]

    if not filtered_items:
        lines.append("- 조회 결과: 일정 없음")
        return "\n".join(lines)

    lines.append(f"- 조회된 일정 수: {len(filtered_items)}")
    for item in filtered_items[:3]:
        lines.append(
            f"- 일정: {item['date']} {item['time']} / 제목 {item['title']} / 상태 {_format_schedule_status(item.get('status'))}"
        )
    return "\n".join(lines)


def _build_medication_grounded_hint(
    filtered_items,
    time_scope: str | None,
    requester_role: RequesterRole,
) -> str:
    label = time_scope or "오늘"
    lines = [
        "[복약 조회 사실]",
        f"- 요청 범위: {label}",
        f"- 사용자 역할: {'guardian' if requester_role == 'guardian' else 'parent'}",
    ]

    if not filtered_items:
        lines.append("- 조회 결과: 복약 정보 없음")
        return "\n".join(lines)

    taken_count = sum(1 for item in filtered_items if item.status == "taken")
    pending_count = sum(1 for item in filtered_items if item.status != "taken")
    lines.extend(
        [
            f"- 조회된 복약 수: {len(filtered_items)}",
            f"- 복용 완료 수: {taken_count}",
            f"- 미확인 복약 수: {pending_count}",
        ]
    )
    for item in filtered_items[:4]:
        lines.append(
            f"- 복약: {item.time} / 약 {item.name} / 상태 {item.status_label}"
        )
    return "\n".join(lines)


def _build_health_status_grounded_hint(
    elder_user_id: str | None,
    requester_role: RequesterRole,
    dashboard: dict | None,
) -> str:
    lines = [
        "[건강 상태 조회 사실]",
        f"- 사용자 역할: {'guardian' if requester_role == 'guardian' else 'parent'}",
    ]

    if not elder_user_id:
        lines.append("- 연결 정보 없음")
        return "\n".join(lines)

    if not dashboard:
        lines.append("- 조회 결과 없음")
        return "\n".join(lines)

    lines.extend(
        [
            f"- 오늘 돌봄 점수: {dashboard.get('care_score', 0)}",
            f"- 상태 판정: {_health_status_level(dashboard)}",
            f"- 체크인 상태: {_format_check_in_status(dashboard['check_in_status'])}",
            f"- 열린 알림 수: {dashboard['open_alert_count']}",
            f"- 점수 반영 알림 수: {dashboard.get('open_high_alert_count', 0) + dashboard.get('open_medium_alert_count', 0)}",
            f"- 오늘 미확인 복약 수: {dashboard['today_medication_pending_count']}",
            f"- 1시간 이상 지난 복약 수: {dashboard.get('overdue_medication_count', 0)}",
            f"- 2시간 이상 지난 복약 수: {dashboard.get('severe_overdue_medication_count', 0)}",
            f"- 복약 누락 수: {dashboard.get('missed_medication_count', 0)}",
            f"- 오늘 일정 수: {dashboard['today_schedule_count']}",
            f"- 최근 위치 상태: {dashboard['latest_location_label']}",
            f"- 케어 모드: {dashboard['care_mode']}",
        ]
    )
    return "\n".join(lines)


def _health_status_level(dashboard: dict) -> str:
    if dashboard.get("care_level") == "caution":
        return "주의 필요"
    if dashboard.get("care_level") == "check":
        return "확인 필요"
    return "안정적"


def _format_care_reason_preview(reasons: list[str]) -> str:
    if not reasons:
        return "현재 점수에 반영된 위험 신호는 없어요."
    if len(reasons) == 1:
        return f"주요 반영 항목은 {reasons[0]}예요."
    return f"주요 반영 항목은 {reasons[0]}, {reasons[1]}예요."


def _filter_schedule_items(
    items: list[dict[str, str]],
    date_range: str | None,
) -> list[dict[str, str]]:
    if not date_range:
        return items[:3]

    today = datetime.now(SEOUL_TZ).date()
    target_date = _resolve_target_date(today, date_range)

    filtered_items: list[dict[str, str]] = []
    for item in items:
        scheduled_at = item.get("scheduled_at")
        if not scheduled_at:
            continue

        scheduled_datetime = datetime.fromisoformat(scheduled_at).astimezone(SEOUL_TZ)
        if target_date and scheduled_datetime.date() == target_date:
            filtered_items.append(item)
            continue

        if WEEKDAY_LABELS[scheduled_datetime.weekday()] == date_range:
            filtered_items.append(item)
            continue

        if item.get("date") == date_range:
            filtered_items.append(item)

    return filtered_items


def _resolve_target_date(today: date, date_range: str) -> date | None:
    if date_range == "오늘":
        return today
    if date_range == "내일":
        return today + timedelta(days=1)
    if date_range == "모레":
        return today + timedelta(days=2)
    if len(date_range) == 10 and date_range.count("-") == 2:
        try:
            return datetime.strptime(date_range, "%Y-%m-%d").date()
        except ValueError:
            return None
    return None


def _filter_medication_items(items, time_scope: str | None):
    if not time_scope or time_scope == "오늘":
        return items

    if time_scope == "지금":
        next_item = next((item for item in items if item.status != "taken"), None)
        return [next_item] if next_item else items[:1]

    filtered_items = [
        item
        for item in items
        if item.last_time_scope == time_scope or _infer_time_scope(item.time) == time_scope
    ]
    return filtered_items or items


def _infer_time_scope(value: str) -> str:
    if "아침" in value:
        return "아침"
    if "점심" in value:
        return "점심"
    if "저녁" in value:
        return "저녁"

    try:
        hour = int(value.split(":", 1)[0])
    except (ValueError, IndexError):
        return "오늘"

    if hour < 11:
        return "아침"
    if hour < 16:
        return "점심"
    return "저녁"


def _build_hospital_visit_response(text: str, requester_role: RequesterRole) -> str:
    lowered = text.strip().lower()

    if requester_role == "guardian":
        if "응급실" in lowered:
            return "부모님이 많이 급해 보이면 바로 119나 가까운 응급실을 확인해 주세요. 어떤 증상이 가장 심한지도 함께 봐주세요."
        return "부모님 병원 방문이 필요해 보이면 가까운 병원이나 보호자 동행 일정을 바로 확인해 주세요. 어떤 불편이 가장 큰지도 같이 봐주세요."

    if "응급실" in lowered:
        return "응급실에 가고 싶으시군요. 많이 급하시면 바로 119나 주변 도움을 요청해 주세요. 어디가 가장 불편한지 말씀해 주세요."

    return "지금 병원에 가고 싶으시군요. 많이 아프시면 바로 보호자나 주변 도움을 요청해 주세요. 어디가 가장 불편한지 말씀해 주세요."


def _build_nearby_hospital_fallback_response(text: str, requester_role: RequesterRole) -> str:
    if requester_role == "guardian":
        if "응급실" in text:
            return "주변 응급실을 찾는 중 문제가 생겼어요. 많이 급하면 바로 119에 연락해 주세요."
        return "주변 병원을 찾는 중 문제가 생겼어요. 잠시 후 다시 확인해 주세요."

    if "응급실" in text:
        return "주변 응급실을 찾는 중 문제가 생겼어요. 많이 급하시면 119에 바로 연락해 주세요."
    return "주변 병원을 찾는 중 문제가 생겼어요. 잠시 후 다시 말씀해 주세요. 많이 불편하시면 119나 보호자에게 바로 도움을 요청해 주세요."


def _build_symptom_support_response(text: str, requester_role: RequesterRole) -> str:
    lowered = text.strip().lower()

    if requester_role == "guardian":
        if any(keyword in lowered for keyword in ("가슴", "숨이", "숨차", "숨이 차", "호흡")):
            return "부모님이 가슴 답답함이나 호흡 불편을 보이면 바로 앉혀 쉬게 하고 119나 응급실 도움을 확인해 주세요."
        if any(keyword in lowered for keyword in ("머리", "두통")):
            return "부모님이 두통을 호소하면 우선 쉬게 하고 어지럼이나 열이 있는지 같이 확인해 주세요."
        if any(keyword in lowered for keyword in ("어지러", "빙글", "휘청")):
            return "부모님이 어지러워하면 바로 앉거나 눕게 하고 계속 어지러운지 지켜봐 주세요."
        if any(keyword in lowered for keyword in ("배", "속이", "메스껍", "토할", "설사")):
            return "부모님 배 상태가 불편하면 잠시 쉬게 하고 수분을 조금씩 드실 수 있는지 확인해 주세요."
        if any(keyword in lowered for keyword in ("기침", "열", "몸살", "춥", "떨려")):
            return "부모님 몸 상태가 좋지 않으면 따뜻하게 쉬게 하고 열이나 호흡 상태를 함께 확인해 주세요."
        return "부모님이 불편해 보이면 우선 쉬게 하고 어떤 증상이 가장 큰지 먼저 확인해 주세요."

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


def _build_mode_answer(mode: CareMode, requester_role: RequesterRole) -> str:
    if requester_role == "guardian":
        if mode == "cognitive_support":
            return "부모님은 지금 인지 지원 모드예요."
        if mode == "health_support":
            return "부모님은 지금 건강 관리 모드예요."
        return "부모님은 지금 기본 모드예요."

    if mode == "cognitive_support":
        return "지금은 인지 지원 모드예요."
    if mode == "health_support":
        return "지금은 건강 관리 모드예요."
    return "지금은 기본 모드예요."


def _format_schedule_status(status: str | None) -> str:
    if status == "completed":
        return "완료"
    if status == "cancelled":
        return "취소"
    return "예정"


def _format_check_in_status(status: str) -> str:
    if status == "pending":
        return "응답 대기"
    if status == "missed":
        return "확인 필요"
    return "응답 완료"


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
