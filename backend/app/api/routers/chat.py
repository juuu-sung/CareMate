from urllib.parse import unquote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.chat import ChatHistoryResponse, ChatMessageRequest, ChatMessageResponse, ChatSpeechRequest, ChatSpeechResponse
from app.services.llm_service import build_chat_response, build_speech_response
from app.services.chat_log_service import list_chat_logs
from app.services.openai_tts_service import OpenAITTSServiceError, synthesize_speech

router = APIRouter()


@router.post("/message", response_model=ChatMessageResponse)
def send_message(payload: ChatMessageRequest, db: Session = Depends(get_db)) -> ChatMessageResponse:
    return build_chat_response(payload, db)


@router.get("/history", response_model=ChatHistoryResponse)
def get_history(limit: int = Query(50, ge=1, le=100), db: Session = Depends(get_db)) -> ChatHistoryResponse:
    return ChatHistoryResponse(items=list_chat_logs(db, limit=limit))


@router.post("/speech", response_model=ChatSpeechResponse)
async def send_speech(
    db: Session = Depends(get_db),
    audio_file: UploadFile = File(...),
    mode: str = Form("basic"),
    audio_format: str = Form("m4a"),
    audio_duration_ms: int | None = Form(default=None),
    client_message_id: str | None = Form(default=None),
    session_id: str | None = Form(default=None),
    transcript_visibility: str = Form("on_low_confidence"),
) -> ChatSpeechResponse:
    audio_bytes = await audio_file.read()
    payload = ChatSpeechRequest(
        mode=mode,
        audio_format=audio_format,
        audio_duration_ms=audio_duration_ms,
        client_message_id=client_message_id,
        session_id=session_id,
        transcript_visibility=transcript_visibility,
    )
    return build_speech_response(
        db,
        payload,
        audio_filename=audio_file.filename,
        audio_bytes=audio_bytes,
        audio_content_type=audio_file.content_type,
    )


@router.get("/tts")
def stream_tts(
    text: str = Query(..., min_length=1, max_length=500),
    mode: str = Query("basic"),
) -> Response:
    try:
        audio_bytes, media_type = synthesize_speech(unquote(text), mode=mode)
    except OpenAITTSServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return Response(
        content=audio_bytes,
        media_type=media_type,
        headers={"Cache-Control": "no-store"},
    )
