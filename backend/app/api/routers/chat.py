from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import CarePrincipal, get_current_care_principal
from app.schemas.chat import (
    ChatHistoryResponse,
    ChatMessageRequest,
    ChatMessageResponse,
    ChatPlaceStatusRequest,
    ChatPlaceStatusResponse,
    ChatSpeechRequest,
    ChatSpeechResponse,
    ChatTtsRequest,
)
from app.core.rate_limit import enforce_rate_limit
from app.services.llm_service import build_chat_response, build_speech_response
from app.services.chat_log_service import list_chat_logs
from app.services.openai_service import OpenAIServiceError, generate_place_status_summary
from app.services.openai_tts_service import OpenAITTSServiceError, synthesize_speech

router = APIRouter()


@router.post("/message", response_model=ChatMessageResponse)
def send_message(
    request: Request,
    payload: ChatMessageRequest,
    principal: CarePrincipal = Depends(get_current_care_principal),
    db: Session = Depends(get_db),
) -> ChatMessageResponse:
    enforce_rate_limit(
        request,
        scope="chat-message",
        max_requests=60,
        window_seconds=60,
        actor_id=principal.actor_user_id,
    )
    payload = payload.model_copy(
        update={
            "elder_user_id": principal.elder_user_id,
            "link_code": principal.link_code,
            "requester_role": "guardian" if principal.role == "guardian" else "parent",
        }
    )
    try:
        return build_chat_response(payload, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/history", response_model=ChatHistoryResponse)
def get_history(
    limit: int = Query(50, ge=1, le=100),
    elder_user_id: str | None = Query(default=None),
    requester_role: str | None = Query(default=None),
    principal: CarePrincipal = Depends(get_current_care_principal),
    db: Session = Depends(get_db),
) -> ChatHistoryResponse:
    elder_user_id = principal.elder_user_id
    requester_role = "guardian" if principal.role == "guardian" else "parent"
    return ChatHistoryResponse(
        items=list_chat_logs(
            db,
            limit=limit,
            senior_user_id=elder_user_id,
            requester_role=requester_role,
        )
    )


@router.post("/place-status", response_model=ChatPlaceStatusResponse)
def get_place_status(
    request: Request,
    payload: ChatPlaceStatusRequest,
    principal: CarePrincipal = Depends(get_current_care_principal),
) -> ChatPlaceStatusResponse:
    enforce_rate_limit(
        request,
        scope="chat-place-status",
        max_requests=20,
        window_seconds=60,
        actor_id=principal.actor_user_id,
    )
    try:
        answer, sources = generate_place_status_summary(
            place_name=payload.place_name,
            address=payload.address,
            phone=payload.phone,
            place_url=payload.place_url,
        )
    except OpenAIServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return ChatPlaceStatusResponse(answer=answer, sources=sources)


@router.post("/speech", response_model=ChatSpeechResponse)
async def send_speech(
    request: Request,
    background_tasks: BackgroundTasks,
    principal: CarePrincipal = Depends(get_current_care_principal),
    db: Session = Depends(get_db),
    audio_file: UploadFile = File(...),
    mode: str = Form("basic"),
    audio_format: str = Form("m4a"),
    audio_duration_ms: int | None = Form(default=None),
    client_message_id: str | None = Form(default=None),
    session_id: str | None = Form(default=None),
    elder_user_id: str | None = Form(default=None),
    requester_role: str = Form("parent"),
    link_code: str | None = Form(default=None),
    transcript_visibility: str = Form("on_low_confidence"),
    latitude: float | None = Form(default=None),
    longitude: float | None = Form(default=None),
) -> ChatSpeechResponse:
    enforce_rate_limit(
        request,
        scope="chat-speech",
        max_requests=20,
        window_seconds=60,
        actor_id=principal.actor_user_id,
    )
    audio_bytes = await audio_file.read()

    elder_user_id = principal.elder_user_id
    link_code = principal.link_code
    requester_role = "guardian" if principal.role == "guardian" else "parent"

    payload = ChatSpeechRequest(
        mode=mode,
        audio_format=audio_format,
        audio_duration_ms=audio_duration_ms,
        client_message_id=client_message_id,
        session_id=session_id,
        elder_user_id=elder_user_id,
        requester_role=requester_role,
        link_code=link_code,
        transcript_visibility=transcript_visibility,
        latitude=latitude,
        longitude=longitude,
    )

    try:
        return build_speech_response(
            db,
            payload,
            audio_filename=audio_file.filename,
            audio_bytes=audio_bytes,
            audio_content_type=audio_file.content_type,
            background_tasks=background_tasks,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/tts")
def stream_tts(
    request: Request,
    payload: ChatTtsRequest,
    principal: CarePrincipal = Depends(get_current_care_principal),
) -> Response:
    enforce_rate_limit(
        request,
        scope="chat-tts",
        max_requests=30,
        window_seconds=60,
        actor_id=principal.actor_user_id,
    )
    try:
        audio_bytes, media_type = synthesize_speech(
            payload.text,
            mode=payload.mode,
            voice=payload.voice,
        )
    except OpenAITTSServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return Response(
        content=audio_bytes,
        media_type=media_type,
        headers={"Cache-Control": "no-store"},
    )
