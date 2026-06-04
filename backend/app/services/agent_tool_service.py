from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.agent import AgentAction, AgentSlots
from app.schemas.chat import CareMode
from app.schemas.location import LocationRequestPayload
from app.schemas.letter import LetterCreateRequest
from app.services.letter import send_letter_from_elder
from app.services.location_service import request_location_refresh
from app.services.medication_service import create_medication_from_slots, record_medication_taken
from app.services.mode_service import change_mode_from_agent
from app.services.schedule_service import create_schedule_from_slots


def execute_agent_action(
    db: Session,
    action: AgentAction,
    slots: AgentSlots,
    mode: CareMode,
    elder_user_id: str | None = None,
    link_code: str | None = None,
) -> tuple[str, AgentAction | None]:
    if action == "create_schedule":
        created_schedule = create_schedule_from_slots(
            db=db,
            slots=slots,
            mode=mode,
            elder_user_id=elder_user_id,
        )
        return (
            f"{created_schedule['date']} {created_schedule['time']} {created_schedule['title']}으로 등록했어요.",
            action,
        )

    if action == "create_medication":
        created_medication = create_medication_from_slots(
            db=db,
            slots=slots,
            elder_user_id=elder_user_id,
        )
        return (
            f"{created_medication['scheduled_time']}에 {created_medication['medication_name']} 복약을 등록했어요.",
            action,
        )

    if action == "send_guardian_message":
        content = slots.content or "안부 메시지"
        elder_user_id_for_letter, link_code = _get_primary_elder_link(
            db,
            elder_user_id=elder_user_id,
        )
        if not elder_user_id_for_letter or not link_code:
            return ("연결된 보호자 정보가 없어서 아직 전달할 수 없어요.", None)

        send_letter_from_elder(
            db,
            elder_user_id=elder_user_id_for_letter,
            payload=LetterCreateRequest(
                link_code=link_code,
                content=content,
            ),
        )
        target = slots.target or "보호자"
        return (f"{target}에게 '{content}'라고 전달했어요.", action)

    if action == "mark_medication_taken":
        recorded = record_medication_taken(
            db,
            slots,
            elder_user_id=elder_user_id,
        )
        return (f"{recorded['time_scope']} {recorded['medication_name']} 복용으로 기록했어요.", action)

    if action == "request_location_refresh":
        if not elder_user_id or not link_code:
            return ("부모님 위치를 요청할 연결 정보가 없어요.", None)

        result = request_location_refresh(
            db,
            LocationRequestPayload(
                elder_user_id=elder_user_id,
                link_code=link_code,
            ),
        )
        return (result["message"], action)

    if action == "change_mode":
        target_mode = slots.target_mode or "basic"
        change_mode_from_agent(db, target_mode, elder_user_id=elder_user_id)
        mode_label = {
            "basic": "기본 모드",
            "cognitive_support": "인지 지원 모드",
            "health_support": "건강 관리 모드",
        }[target_mode]
        return (f"{mode_label}로 바꿨어요.", action)

    return ("요청을 처리했어요.", action)


def _get_primary_elder_link(
    db: Session,
    elder_user_id: str | None = None,
) -> tuple[str | None, str | None]:
    if elder_user_id:
        row = db.execute(
            text(
                """
                SELECT elder_user_id, link_code
                FROM guardian_links
                WHERE elder_user_id = :elder_user_id
                  AND guardian_user_id IS NOT NULL
                ORDER BY created_at ASC
                LIMIT 1
                """
            ),
            {"elder_user_id": elder_user_id},
        ).mappings().first()

        if row:
            return row["elder_user_id"], row["link_code"]

    row = db.execute(
        text(
            """
            SELECT elder_user_id, link_code
            FROM guardian_links
            WHERE guardian_user_id IS NOT NULL
            ORDER BY created_at ASC
            LIMIT 1
            """
        )
    ).mappings().first()

    if not row:
        return None, None

    return row["elder_user_id"], row["link_code"]
