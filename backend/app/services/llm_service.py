import logging
import re
from time import perf_counter
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import settings
from app.schemas.agent import AgentPlan, AgentSessionState, AgentSlots
from app.schemas.chat import (
    ChatPlaceItem,
    ChatSourceItem,
    ChatIntent,
    ChatMessageRequest,
    ChatMessageResponse,
    ChatSpeechRequest,
    ChatSpeechResponse,
    RequesterRole,
)
from app.services.agent_confirmation_service import build_confirmation_question, build_missing_slot_question
from app.services.agent_service import action_to_intent, build_agent_plan
from app.services.agent_slot_service import (
    extract_agent_slots,
    find_missing_slots,
    merge_agent_slots,
    normalize_agent_slots,
)
from app.services.agent_tool_service import execute_agent_action
from app.services.chat_log_service import append_chat_log, list_chat_logs
from app.services.agent_session_service import clear_expired_sessions, clear_session, get_session, save_session
from app.services.openai_audio_service import OpenAIAudioServiceError, transcribe_audio
from app.services.openai_service import OpenAIServiceError, generate_chat_text, generate_web_search_answer
from app.services.response_policy_service import build_response_policy
from app.services.elder_profile_service import get_elder_profile_context
from app.services.guardian_service import validate_guardian_access

logger = logging.getLogger(__name__)


def build_chat_response(payload: ChatMessageRequest, db: Session) -> ChatMessageResponse:
    started_at = perf_counter()
    clear_expired_sessions(db)
    _validate_requester_context(payload=payload, db=db)
    session_id = payload.session_id or payload.client_message_id or f"session-{uuid4().hex[:12]}"
    recent_messages = _load_recent_messages(
        db=db,
        elder_user_id=payload.elder_user_id,
        requester_role=payload.requester_role,
    )
    elder_profile_context = _resolve_elder_profile_context(payload=payload, db=db)
    append_chat_log(
        db,
        role="user",
        content=payload.text,
        mode=payload.mode,
        senior_user_id=payload.elder_user_id,
        requester_role=payload.requester_role,
    )
    agent_plan = _build_effective_agent_plan(
        db=db,
        session_id=session_id,
        text=payload.text,
        mode=payload.mode,
        elder_user_id=payload.elder_user_id,
        requester_role=payload.requester_role,
        recent_messages=recent_messages,
        elder_profile_context=elder_profile_context,
    )
    answer, clarification_question, llm_latency_ms, places, sources = _build_answer(
        db=db,
        agent_plan=agent_plan,
        text=payload.text,
        mode=payload.mode,
        elder_user_id=payload.elder_user_id,
        requester_role=payload.requester_role,
        link_code=payload.link_code,
        latitude=payload.latitude,
        longitude=payload.longitude,
        elder_profile_context=elder_profile_context,
        recent_messages=recent_messages,
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
    append_chat_log(
        db,
        role="assistant",
        content=assistant_content,
        mode=payload.mode,
        senior_user_id=payload.elder_user_id,
        requester_role=payload.requester_role,
    )

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
        sources=sources,
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
    _validate_requester_context(payload=payload, db=db)
    session_id = payload.session_id or payload.client_message_id or f"session-{uuid4().hex[:12]}"

    stt_started_at = perf_counter()
    transcript = _build_transcript(
        audio_filename=audio_filename,
        audio_bytes=audio_bytes,
        audio_content_type=audio_content_type,
    )
    recent_messages = _load_recent_messages(
        db=db,
        elder_user_id=payload.elder_user_id,
        requester_role=payload.requester_role,
    )
    elder_profile_context = _resolve_elder_profile_context(payload=payload, db=db)
    append_chat_log(
        db,
        role="user",
        content=transcript,
        mode=payload.mode,
        senior_user_id=payload.elder_user_id,
        requester_role=payload.requester_role,
    )
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
        append_chat_log(
            db,
            role="assistant",
            content="다시 한 번 천천히 말씀해 주세요.",
            mode=payload.mode,
            senior_user_id=payload.elder_user_id,
            requester_role=payload.requester_role,
        )
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

    agent_plan = _build_effective_agent_plan(
        db=db,
        session_id=session_id,
        text=transcript,
        mode=payload.mode,
        elder_user_id=payload.elder_user_id,
        requester_role=payload.requester_role,
        recent_messages=recent_messages,
        elder_profile_context=elder_profile_context,
    )
    answer, clarification_question, llm_latency_ms, places, sources = _build_answer(
        db=db,
        agent_plan=agent_plan,
        text=transcript,
        mode=payload.mode,
        elder_user_id=payload.elder_user_id,
        requester_role=payload.requester_role,
        link_code=payload.link_code,
        latitude=payload.latitude,
        longitude=payload.longitude,
        elder_profile_context=elder_profile_context,
        recent_messages=recent_messages,
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
    append_chat_log(
        db,
        role="assistant",
        content=assistant_content,
        mode=payload.mode,
        senior_user_id=payload.elder_user_id,
        requester_role=payload.requester_role,
    )

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
        sources=sources,
        stt_latency_ms=stt_latency_ms,
        llm_latency_ms=llm_latency_ms,
        total_latency_ms=total_latency_ms,
    )


def _build_answer(
    db: Session,
    agent_plan: AgentPlan,
    text: str,
    mode: str,
    elder_user_id: str | None,
    requester_role: RequesterRole,
    link_code: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    elder_profile_context: str | None = None,
    recent_messages: list[dict[str, str]] | None = None,
) -> tuple[str, str | None, int | None, list[ChatPlaceItem], list[ChatSourceItem]]:
    if agent_plan.intent == "needs_clarification":
        return "", agent_plan.clarification_question or "무슨 뜻인지 다시 한 번 말씀해 주세요.", None, [], []

    if agent_plan.missing_slots:
        return "", agent_plan.clarification_question, None, [], []

    if agent_plan.awaiting_confirmation:
        return "", agent_plan.clarification_question, None, [], []

    if agent_plan.executed_action:
        return agent_plan.clarification_question or "", None, None, [], []

    policy = build_response_policy(
        db=db,
        agent_plan=agent_plan,
        text=text,
        mode=mode,
        elder_user_id=elder_user_id,
        requester_role=requester_role,
        link_code=link_code,
        latitude=latitude,
        longitude=longitude,
    )

    if policy.answer and not policy.use_llm:
        return policy.answer, None, None, policy.places or [], []

    answer, llm_latency_ms, sources = _generate_llm_answer(
        intent=agent_plan.intent,
        text=text,
        mode=mode,
        requester_role=requester_role,
        fallback_answer=policy.answer,
        grounded_hint=policy.grounded_hint,
        elder_profile_context=elder_profile_context,
        recent_messages=recent_messages,
    )
    return answer, None, llm_latency_ms, [], sources


def _generate_llm_answer(
    intent: ChatIntent,
    text: str,
    mode: str,
    requester_role: RequesterRole,
    fallback_answer: str | None = None,
    grounded_hint: str | None = None,
    elder_profile_context: str | None = None,
    recent_messages: list[dict[str, str]] | None = None,
) -> tuple[str, int | None, list[ChatSourceItem]]:
    started_at = perf_counter()
    if _get_effective_llm_provider() == "openai":
        try:
            if intent == "web_search_support":
                answer, sources = generate_web_search_answer(
                    user_text=text,
                    mode=mode,
                    recent_messages=recent_messages,
                )
                return answer, _elapsed_ms(started_at), sources
            answer = generate_chat_text(
                intent=intent,
                user_text=text,
                mode=mode,
                requester_role=requester_role,
                grounded_hint=grounded_hint,
                elder_profile_context=elder_profile_context,
                recent_messages=recent_messages,
            )
            return answer, _elapsed_ms(started_at), []
        except OpenAIServiceError:
            return (
                fallback_answer or _build_stub_answer(intent=intent, text=text, mode=mode, grounded_hint=grounded_hint),
                _elapsed_ms(started_at),
                [],
            )

    return fallback_answer or _build_stub_answer(intent=intent, text=text, mode=mode, grounded_hint=grounded_hint), None, []


def _validate_requester_context(payload, db: Session) -> None:
    if getattr(payload, "requester_role", "parent") != "guardian":
        return

    elder_user_id = getattr(payload, "elder_user_id", None)
    link_code = getattr(payload, "link_code", None)

    if not elder_user_id or not link_code:
        raise ValueError("보호자 질문에는 연동된 부모님 정보가 필요합니다.")

    validate_guardian_access(db, elder_user_id=elder_user_id, link_code=link_code)

def _resolve_elder_profile_context(payload, db: Session) -> str | None:
    elder_user_id = getattr(payload, "elder_user_id", None) or getattr(payload, "user_id", None)
    if not elder_user_id:
        return None

    try:
        return get_elder_profile_context(elder_user_id, db)
    except Exception:
        logger.exception("failed to load elder profile context elder_user_id=%s", elder_user_id)
        return None


def _build_stub_answer(intent: ChatIntent, text: str, mode: str, grounded_hint: str | None = None) -> str:
    if intent in {"schedule_lookup", "medication_lookup", "health_status_lookup"} and grounded_hint:
        return grounded_hint
    if intent == "web_search_support":
        return f"'{text}'는 지금 바로 웹에서 확인하지 못했어요. 잠시 후 다시 말씀해 주세요."
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


def _load_recent_messages(
    db: Session,
    elder_user_id: str | None,
    requester_role: RequesterRole,
) -> list[dict[str, str]]:
    if settings.chat_history_turns <= 0:
        return []

    items = list_chat_logs(
        db,
        limit=settings.chat_history_turns,
        senior_user_id=elder_user_id,
        requester_role=requester_role,
    )
    return [
        {
            "role": item["role"],
            "content": item["content"],
        }
        for item in items
        if item["role"] in {"user", "assistant"} and item["content"].strip()
    ]


def _build_effective_agent_plan(
    db: Session,
    session_id: str,
    text: str,
    mode: str,
    elder_user_id: str | None,
    requester_role: RequesterRole,
    recent_messages: list[dict[str, str]] | None = None,
    elder_profile_context: str | None = None,
) -> AgentPlan:
    active_session = get_session(db, session_id)
    normalized = text.strip()

    if active_session:
        if active_session.awaiting_confirmation:
            if _is_affirmative(normalized):
                answer, executed_action = execute_agent_action(
                    db,
                    active_session.pending_action,
                    active_session.slots,
                    mode,
                    elder_user_id=elder_user_id,
                )
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
            refreshed_plan = build_agent_plan(
                normalized,
                mode,
                requester_role=requester_role,
                recent_messages=recent_messages,
                elder_profile_context=elder_profile_context,
            )
            updated_confirmation_plan = _build_updated_confirmation_plan(
                active_session=active_session,
                refreshed_plan=refreshed_plan,
                text=normalized,
            )
            if updated_confirmation_plan:
                save_session(
                    db,
                    AgentSessionState(
                        session_id=session_id,
                        mode=mode,
                        pending_action=active_session.pending_action,
                        slots=updated_confirmation_plan.slots,
                        awaiting_confirmation=updated_confirmation_plan.awaiting_confirmation,
                    )
                )
                return updated_confirmation_plan
            if _should_interrupt_confirmation(
                text=normalized,
                fresh_plan=refreshed_plan,
                pending_action=active_session.pending_action,
            ):
                clear_session(db, session_id)
                _persist_agent_plan_session(db, session_id, mode, refreshed_plan)
                return refreshed_plan
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

        fresh_plan = build_agent_plan(
            normalized,
            mode,
            requester_role=requester_role,
            recent_messages=recent_messages,
            elder_profile_context=elder_profile_context,
        )
        if fresh_plan.action != active_session.pending_action and fresh_plan.action not in {
            "general_support",
            "needs_clarification",
        }:
            clear_session(db, session_id)
            _persist_agent_plan_session(db, session_id, mode, fresh_plan)
            return fresh_plan

        llm_slot_updates = (
            fresh_plan.slots
            if fresh_plan.action == active_session.pending_action
            else AgentSlots()
        )
        fallback_slot_updates = extract_agent_slots(active_session.pending_action, normalized)
        merged_slots = normalize_agent_slots(
            active_session.pending_action,
            merge_agent_slots(
                active_session.slots,
                merge_agent_slots(fallback_slot_updates, llm_slot_updates),
            ),
        )
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

    agent_plan = build_agent_plan(
        normalized,
        mode,
        requester_role=requester_role,
        recent_messages=recent_messages,
        elder_profile_context=elder_profile_context,
    )
    _persist_agent_plan_session(db, session_id, mode, agent_plan)
    return agent_plan


def _is_affirmative(text: str) -> bool:
    normalized = _normalize_confirmation_text(text)
    if normalized in {
        "응",
        "네",
        "예",
        "넵",
        "넹",
        "맞아",
        "맞아요",
        "맞습니다",
        "그래",
        "그래요",
        "좋아",
        "좋습니다",
        "오케이",
        "ok",
        "해줘",
        "해주세요",
        "진행해줘",
        "진행해주세요",
        "등록해줘",
        "등록해주세요",
        "추가해줘",
        "추가해주세요",
        "보내줘",
        "보내주세요",
        "기록해줘",
        "기록해주세요",
        "바꿔줘",
        "바꿔주세요",
    }:
        return True

    return normalized.startswith(("응", "네", "예", "넵", "넹", "맞아", "그래", "좋아"))


def _is_negative(text: str) -> bool:
    normalized = _normalize_confirmation_text(text)
    if normalized in {
        "아니",
        "아니오",
        "아니야",
        "취소",
        "취소해",
        "취소해줘",
        "하지마",
        "하지말아줘",
        "안해",
        "안할래",
        "괜찮아",
        "됐어",
        "그만",
    }:
        return True

    return normalized.startswith(("아니", "취소", "안해", "안할래"))


def _normalize_confirmation_text(text: str) -> str:
    normalized = text.strip().lower()
    normalized = re.sub(r"[.,!?~…]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    compact = normalized.replace(" ", "")

    for filler in ("음", "어", "저기", "그럼", "음음", "어어"):
        if compact.startswith(filler) and len(compact) > len(filler):
            compact = compact[len(filler):]
            break

    return compact


def _build_updated_confirmation_plan(
    active_session: AgentSessionState,
    refreshed_plan: AgentPlan,
    text: str,
) -> AgentPlan | None:
    llm_slot_updates = (
        refreshed_plan.slots
        if refreshed_plan.action == active_session.pending_action
        else AgentSlots()
    )
    fallback_slot_updates = extract_agent_slots(active_session.pending_action, text)
    slot_updates = normalize_agent_slots(
        active_session.pending_action,
        merge_agent_slots(fallback_slot_updates, llm_slot_updates),
    )
    if not _has_slot_updates(slot_updates):
        return None

    merged_slots = merge_agent_slots(active_session.slots, slot_updates)
    missing_slots = find_missing_slots(active_session.pending_action, merged_slots)
    requires_confirmation = active_session.pending_action in {
        "create_schedule",
        "send_guardian_message",
        "mark_medication_taken",
        "change_mode",
    }
    clarification_question = build_missing_slot_question(active_session.pending_action, missing_slots)
    awaiting_confirmation = False

    if not clarification_question and requires_confirmation:
        clarification_question = build_confirmation_question(active_session.pending_action, merged_slots)
        awaiting_confirmation = bool(clarification_question)

    return AgentPlan(
        action=active_session.pending_action,
        intent=action_to_intent(active_session.pending_action),
        slots=merged_slots,
        missing_slots=missing_slots,
        requires_confirmation=requires_confirmation,
        awaiting_confirmation=awaiting_confirmation,
        clarification_question=clarification_question,
        pending_action=active_session.pending_action if requires_confirmation else None,
        executed_action=None,
    )


def _has_slot_updates(slot_updates) -> bool:
    return any(value for value in slot_updates.model_dump().values())


def _should_interrupt_confirmation(
    text: str,
    fresh_plan: AgentPlan,
    pending_action: str,
) -> bool:
    if fresh_plan.action not in {pending_action, "needs_clarification"}:
        return True

    if fresh_plan.action == "general_support" and _looks_like_new_topic_while_confirming(text):
        return True

    return False


def _looks_like_new_topic_while_confirming(text: str) -> bool:
    normalized = text.strip().lower()
    if len(normalized) < 4:
        return False

    if "?" in normalized:
        return True

    interrupt_keywords = (
        "왜",
        "뭐",
        "무슨",
        "어떻게",
        "근데",
        "그런데",
        "문제",
        "오류",
        "안 돼",
        "안돼",
        "못",
        "했는데",
        "추가해달라고",
        "말했는데",
    )
    return any(keyword in normalized for keyword in interrupt_keywords)


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
