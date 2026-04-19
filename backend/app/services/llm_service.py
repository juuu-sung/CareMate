import logging
from time import perf_counter
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import settings
from app.schemas.agent import AgentPlan, AgentSessionState
from app.schemas.chat import (
    ChatPlaceItem,
    ChatIntent,
    ChatMessageRequest,
    ChatMessageResponse,
    ChatSpeechRequest,
    ChatSpeechResponse,
)
from app.services.agent_confirmation_service import build_confirmation_question
from app.services.agent_service import action_to_intent, build_agent_plan
from app.services.agent_slot_service import extract_agent_slots, find_missing_slots, merge_agent_slots
from app.services.agent_tool_service import execute_agent_action
from app.services.chat_log_service import append_chat_log
from app.services.agent_session_service import clear_expired_sessions, clear_session, get_session, save_session
from app.services.openai_audio_service import OpenAIAudioServiceError, transcribe_audio
from app.services.openai_service import OpenAIServiceError, generate_chat_text
from app.services.response_policy_service import build_response_policy
from app.services.elder_profile_service import get_elder_profile_context

logger = logging.getLogger(__name__)


def build_chat_response(payload: ChatMessageRequest, db: Session) -> ChatMessageResponse:
    started_at = perf_counter()
    clear_expired_sessions(db)
    session_id = payload.session_id or payload.client_message_id or f"session-{uuid4().hex[:12]}"
    append_chat_log(db, role="user", content=payload.text, mode=payload.mode)

    agent_plan = _build_effective_agent_plan(db=db, session_id=session_id, text=payload.text, mode=payload.mode)

    elder_profile_context = _resolve_elder_profile_context(payload=payload, db=db)

    answer, clarification_question, llm_latency_ms, places = _build_answer(
        agent_plan=agent_plan,
        text=payload.text,
        mode=payload.mode,
        latitude=payload.latitude,
        longitude=payload.longitude,
        elder_profile_context=elder_profile_context,
    )

    provider = _get_effective_llm_provider()
    total_latency_ms = _elapsed_ms(started_at)

    logger.info(
        "chat.message provider=%s intent=%s mode=%s llm_latency_ms=%s total_latency_ms=%s",
        provider,
        agent_plan.intent,
        payload.mode,
        llm_latency_ms,
        total_latency_ms,
    )

    assistant_content = clarification_question or answer
    append_chat_log(db, role="assistant", content=assistant_content, mode=payload.mode)

    return ChatMessageResponse(
        answer=answer,
        confirmation_needed=clarification_question is not None,
        clarification_question=clarification_question,
        transcript=payload.text,
        intent=agent_plan.intent,
        provider=provider,
        mode=payload.mode,
        session_id=session_id,
        pending_action=agent_plan.pending_action,
        awaiting_confirmation=agent_plan.awaiting_confirmation,
        missing_slots=agent_plan.missing_slots,
        executed_action=agent_plan.executed_action,
        places=places,
        llm_latency_ms=llm_latency_ms,
        total_latency_ms=total_latency_ms,
    )


def build_speech_response(
    db: Session,
    payload: ChatSpeechRequest,
    audio_filename: str | None = None,
    audio_bytes: bytes | None = None,
    audio_content_type: str | None = None,
) -> ChatSpeechResponse:
    started_at = perf_counter()
    clear_expired_sessions(db)
    session_id = payload.session_id or payload.client_message_id or f"session-{uuid4().hex[:12]}"

    stt_started_at = perf_counter()
    transcript = _build_transcript(
        audio_filename=audio_filename,
        audio_bytes=audio_bytes,
        audio_content_type=audio_content_type,
    )
    append_chat_log(db, role="user", content=transcript, mode=payload.mode)
    stt_latency_ms = _elapsed_ms(stt_started_at)
    stt_confidence = _estimate_confidence(payload.audio_duration_ms, transcript)
    llm_provider = _get_effective_llm_provider()
    stt_provider = _get_effective_stt_provider()

    if stt_confidence < 0.75:
        total_latency_ms = _elapsed_ms(started_at)
        logger.info(
            "chat.speech stt_provider=%s llm_provider=%s intent=needs_clarification mode=%s stt_confidence=%.2f stt_latency_ms=%s llm_latency_ms=%s total_latency_ms=%s",
            stt_provider,
            llm_provider,
            payload.mode,
            stt_confidence,
            stt_latency_ms,
            None,
            total_latency_ms,
        )
        append_chat_log(db, role="assistant", content="다시 한 번 천천히 말씀해 주세요.", mode=payload.mode)
        return ChatSpeechResponse(
            transcript=transcript,
            stt_confidence=stt_confidence,
            answer="",
            confirmation_needed=True,
            clarification_question="다시 한 번 천천히 말씀해 주세요.",
            intent="needs_clarification",
            stt_provider=stt_provider,
            llm_provider=llm_provider,
            mode=payload.mode,
            session_id=session_id,
            pending_action=None,
            awaiting_confirmation=False,
            missing_slots=[],
            executed_action=None,
            stt_latency_ms=stt_latency_ms,
            llm_latency_ms=None,
            total_latency_ms=total_latency_ms,
        )

    agent_plan = _build_effective_agent_plan(db=db, session_id=session_id, text=transcript, mode=payload.mode)

    elder_profile_context = _resolve_elder_profile_context(payload=payload, db=db)

    answer, clarification_question, llm_latency_ms, places = _build_answer(
        agent_plan=agent_plan,
        text=transcript,
        mode=payload.mode,
        latitude=payload.latitude,
        longitude=payload.longitude,
        elder_profile_context=elder_profile_context,
    )

    total_latency_ms = _elapsed_ms(started_at)

    logger.info(
        "chat.speech stt_provider=%s llm_provider=%s intent=%s mode=%s stt_confidence=%.2f stt_latency_ms=%s llm_latency_ms=%s total_latency_ms=%s",
        stt_provider,
        llm_provider,
        agent_plan.intent,
        payload.mode,
        stt_confidence,
        stt_latency_ms,
        llm_latency_ms,
        total_latency_ms,
    )

    assistant_content = clarification_question or answer
    append_chat_log(db, role="assistant", content=assistant_content, mode=payload.mode)

    return ChatSpeechResponse(
        transcript=transcript,
        stt_confidence=stt_confidence,
        answer=answer,
        confirmation_needed=clarification_question is not None,
        clarification_question=clarification_question,
        intent=agent_plan.intent,
        stt_provider=stt_provider,
        llm_provider=llm_provider,
        mode=payload.mode,
        session_id=session_id,
        pending_action=agent_plan.pending_action,
        awaiting_confirmation=agent_plan.awaiting_confirmation,
        missing_slots=agent_plan.missing_slots,
        executed_action=agent_plan.executed_action,
        places=places,
        stt_latency_ms=stt_latency_ms,
        llm_latency_ms=llm_latency_ms,
        total_latency_ms=total_latency_ms,
    )


def _build_answer(
    agent_plan: AgentPlan,
    text: str,
    mode: str,
    latitude: float | None = None,
    longitude: float | None = None,
    elder_profile_context: str | None = None,
) -> tuple[str, str | None, int | None, list[ChatPlaceItem]]:
    if agent_plan.intent == "needs_clarification":
        return "", agent_plan.clarification_question or "무슨 뜻인지 다시 한 번 말씀해 주세요.", None, []

    if agent_plan.missing_slots:
        return "", agent_plan.clarification_question, None, []

    if agent_plan.awaiting_confirmation:
        return "", agent_plan.clarification_question, None, []

    if agent_plan.executed_action:
        return agent_plan.clarification_question or "", None, None, []

    policy = build_response_policy(
        agent_plan=agent_plan,
        text=text,
        mode=mode,
        latitude=latitude,
        longitude=longitude,
    )

    if policy.answer:
        return policy.answer, None, None, policy.places or []

    answer, llm_latency_ms = _generate_llm_answer(
        intent=agent_plan.intent,
        text=text,
        mode=mode,
        grounded_hint=policy.grounded_hint,
        elder_profile_context=elder_profile_context,
    )
    return answer, None, llm_latency_ms, []


def _generate_llm_answer(
    intent: ChatIntent,
    text: str,
    mode: str,
    grounded_hint: str | None = None,
    elder_profile_context: str | None = None,
) -> tuple[str, int | None]:
    started_at = perf_counter()
    if _get_effective_llm_provider() == "openai":
        try:
            answer = generate_chat_text(
                intent=intent,
                user_text=text,
                mode=mode,
                grounded_hint=grounded_hint,
                elder_profile_context=elder_profile_context,
            )
            return answer, _elapsed_ms(started_at)
        except OpenAIServiceError:
            return _build_stub_answer(
                intent=intent,
                text=text,
                mode=mode,
                grounded_hint=grounded_hint,
            ), _elapsed_ms(started_at)

    return _build_stub_answer(
        intent=intent,
        text=text,
        mode=mode,
        grounded_hint=grounded_hint,
    ), None


def _resolve_elder_profile_context(payload, db: Session) -> str | None:
    elder_user_id = getattr(payload, "elder_user_id", None) or getattr(payload, "user_id", None)

    print("DEBUG elder_user_id:", elder_user_id)

    if not elder_user_id:
        print("DEBUG elder profile context: user id 없음")
        return None

    try:
        context = get_elder_profile_context(elder_user_id, db)
        print("DEBUG elder profile context loaded:", context)
        return context
    except Exception as e:
        print("DEBUG elder profile context error:", str(e))
        return None


def _build_stub_answer(intent: ChatIntent, text: str, mode: str, grounded_hint: str | None = None) -> str:
    if intent == "schedule_lookup" and grounded_hint:
        return grounded_hint
    if intent == "medication_lookup" and grounded_hint:
        return grounded_hint
    if intent == "small_talk":
        return "심심하실 수 있어요. 잠깐 같이 이야기해볼까요?"
    return f"'{text}'에 대한 기본 응답입니다. 실제 LLM 연동 전까지 사용하는 임시 응답입니다."


def _get_effective_llm_provider() -> str:
    if settings.llm_provider != "stub":
        return settings.llm_provider
    if settings.openai_api_key:
        return "openai"
    return "stub"


def _get_effective_stt_provider() -> str:
    if settings.stt_provider != "stub":
        return settings.stt_provider
    if settings.openai_api_key:
        return "openai"
    return "stub"


def _build_transcript(
    *,
    audio_filename: str | None,
    audio_bytes: bytes | None,
    audio_content_type: str | None,
) -> str:
    if _get_effective_stt_provider() == "openai" and audio_bytes:
        try:
            return transcribe_audio(
                file_bytes=audio_bytes,
                filename=audio_filename or "audio.m4a",
                content_type=audio_content_type,
            )
        except OpenAIAudioServiceError:
            return _build_placeholder_transcript(audio_filename)

    return _build_placeholder_transcript(audio_filename)


def _build_placeholder_transcript(audio_filename: str | None) -> str:
    if audio_filename:
        return f"음성 전사 대기 중입니다. 파일명: {audio_filename}"
    return "음성 전사 대기 중입니다."


def _estimate_confidence(audio_duration_ms: int | None, transcript: str) -> float:
    if transcript.startswith("음성 전사 대기 중입니다."):
        return _estimate_placeholder_confidence(audio_duration_ms)
    return 0.95


def _estimate_placeholder_confidence(audio_duration_ms: int | None) -> float:
    if audio_duration_ms is None:
        return 0.3
    if audio_duration_ms < 1500:
        return 0.2
    return 0.3


def _elapsed_ms(started_at: float) -> int:
    return max(0, round((perf_counter() - started_at) * 1000))


def _build_effective_agent_plan(db: Session, session_id: str, text: str, mode: str) -> AgentPlan:
    active_session = get_session(db, session_id)
    normalized = text.strip()

    if active_session:
        if active_session.awaiting_confirmation:
            if _is_affirmative(normalized):
                answer, executed_action = execute_agent_action(db, active_session.pending_action, active_session.slots, mode)
                clear_session(db, session_id)
                return AgentPlan(
                    action=active_session.pending_action,
                    intent=action_to_intent(active_session.pending_action),
                    slots=active_session.slots,
                    missing_slots=[],
                    requires_confirmation=True,
                    awaiting_confirmation=False,
                    clarification_question=answer,
                    pending_action=None,
                    executed_action=executed_action,
                )
            if _is_negative(normalized):
                clear_session(db, session_id)
                return AgentPlan(
                    action="general_support",
                    intent="general_support",
                    clarification_question="알겠어요. 이번 요청은 취소할게요.",
                    pending_action=None,
                    executed_action="general_support",
                )
            return AgentPlan(
                action=active_session.pending_action,
                intent=action_to_intent(active_session.pending_action),
                slots=active_session.slots,
                missing_slots=[],
                requires_confirmation=True,
                awaiting_confirmation=True,
                clarification_question="네 또는 아니오로 말씀해 주세요.",
                pending_action=active_session.pending_action,
                executed_action=None,
            )

        fresh_plan = build_agent_plan(normalized, mode)
        if fresh_plan.action != active_session.pending_action and fresh_plan.action not in {
            "general_support",
            "needs_clarification",
        }:
            clear_session(db, session_id)
            _persist_agent_plan_session(db, session_id, mode, fresh_plan)
            return fresh_plan

        new_slots = extract_agent_slots(active_session.pending_action, normalized)
        merged_slots = merge_agent_slots(active_session.slots, new_slots)
        missing_slots = find_missing_slots(active_session.pending_action, merged_slots)
        updated_plan = fresh_plan
        updated_plan.action = active_session.pending_action
        updated_plan.intent = action_to_intent(active_session.pending_action)
        updated_plan.slots = merged_slots
        updated_plan.missing_slots = missing_slots
        updated_plan.pending_action = active_session.pending_action
        updated_plan.requires_confirmation = active_session.pending_action in {
            "create_schedule",
            "send_guardian_message",
            "mark_medication_taken",
            "change_mode",
        }
        if missing_slots:
            updated_plan.awaiting_confirmation = False
            save_session(
                db,
                AgentSessionState(
                    session_id=session_id,
                    mode=mode,
                    pending_action=active_session.pending_action,
                    slots=merged_slots,
                    awaiting_confirmation=False,
                )
            )
            return updated_plan

        updated_plan.awaiting_confirmation = bool(updated_plan.requires_confirmation)
        if updated_plan.awaiting_confirmation:
            updated_plan.clarification_question = build_confirmation_question(
                active_session.pending_action,
                merged_slots,
            )
            save_session(
                db,
                AgentSessionState(
                    session_id=session_id,
                    mode=mode,
                    pending_action=active_session.pending_action,
                    slots=merged_slots,
                    awaiting_confirmation=True,
                )
            )
        else:
            clear_session(db, session_id)
        return updated_plan

    agent_plan = build_agent_plan(normalized, mode)
    _persist_agent_plan_session(db, session_id, mode, agent_plan)
    return agent_plan


def _is_affirmative(text: str) -> bool:
    normalized = text.strip().lower()
    return normalized in {"응", "네", "예", "맞아", "그래", "좋아", "해줘", "응 해줘", "네 해줘"} or normalized.startswith(
        ("응", "네", "예")
    )


def _is_negative(text: str) -> bool:
    normalized = text.strip().lower()
    return normalized in {"아니", "아니오", "취소", "하지마", "안 해", "괜찮아"}


def _persist_agent_plan_session(db: Session, session_id: str, mode: str, agent_plan: AgentPlan) -> None:
    if agent_plan.missing_slots:
        save_session(
            db,
            AgentSessionState(
                session_id=session_id,
                mode=mode,
                pending_action=agent_plan.action,
                slots=agent_plan.slots,
                awaiting_confirmation=False,
            )
        )
        return

    if agent_plan.pending_action:
        save_session(
            db,
            AgentSessionState(
                session_id=session_id,
                mode=mode,
                pending_action=agent_plan.pending_action,
                slots=agent_plan.slots,
                awaiting_confirmation=agent_plan.awaiting_confirmation,
            )
        )
        return

    clear_session(db, session_id)