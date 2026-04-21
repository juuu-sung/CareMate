from urllib.parse import unquote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.chat import (
    ChatHistoryResponse,
    ChatMessageRequest,
    ChatMessageResponse,
    ChatPlaceStatusRequest,
    ChatPlaceStatusResponse,
    ChatSpeechRequest,
    ChatSpeechResponse,
)
from app.services.llm_service import build_chat_response, build_speech_response
from app.services.chat_log_service import list_chat_logs
from app.services.openai_service import OpenAIServiceError, generate_place_status_summary
from app.services.openai_tts_service import OpenAITTSServiceError, synthesize_speech

router = APIRouter()


@router.post("/message", response_model=ChatMessageResponse)
def send_message(payload: ChatMessageRequest, db: Session = Depends(get_db)) -> ChatMessageResponse:
    try:
        return build_chat_response(payload, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/history", response_model=ChatHistoryResponse)
def get_history(
    limit: int = Query(50, ge=1, le=100),
    elder_user_id: str | None = Query(default=None),
    requester_role: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> ChatHistoryResponse:
    return ChatHistoryResponse(
        items=list_chat_logs(
            db,
            limit=limit,
            senior_user_id=elder_user_id,
            requester_role=requester_role,
        )
    )


@router.post("/place-status", response_model=ChatPlaceStatusResponse)
def get_place_status(payload: ChatPlaceStatusRequest) -> ChatPlaceStatusResponse:
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
    audio_bytes = await audio_file.read()

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

    print("DEBUG /speech payload:", payload.model_dump())

    try:
        return build_speech_response(
            db,
            payload,
            audio_filename=audio_file.filename,
            audio_bytes=audio_bytes,
            audio_content_type=audio_file.content_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/tts")
def stream_tts(
    text: str = Query(..., min_length=1, max_length=500),
    mode: str = Query("basic"),
    voice: str | None = Query(default=None),
) -> Response:
    try:
        audio_bytes, media_type = synthesize_speech(
            unquote(text),
            mode=mode,
            voice=voice,
        )
    except OpenAITTSServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return Response(
        content=audio_bytes,
        media_type=media_type,
        headers={"Cache-Control": "no-store"},
    )
