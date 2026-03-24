from fastapi import APIRouter

from app.schemas.chat import ChatMessageRequest, ChatMessageResponse
from app.services.llm_service import build_chat_response

router = APIRouter()


@router.post("/message", response_model=ChatMessageResponse)
def send_message(payload: ChatMessageRequest) -> ChatMessageResponse:
    return build_chat_response(payload)
