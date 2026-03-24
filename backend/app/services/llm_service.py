from app.schemas.chat import ChatMessageRequest, ChatMessageResponse


def build_chat_response(payload: ChatMessageRequest) -> ChatMessageResponse:
    answer = f"'{payload.text}'에 대한 기본 응답입니다. 실제 LLM 연동 전까지 사용하는 임시 응답입니다."
    return ChatMessageResponse(answer=answer, confirmation_needed=False)
