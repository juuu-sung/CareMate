from pydantic import BaseModel


class ChatMessageRequest(BaseModel):
    text: str
    mode: str = "basic"


class ChatMessageResponse(BaseModel):
    answer: str
    confirmation_needed: bool = False
