from pydantic import BaseModel


class AlertItem(BaseModel):
    type: str
    message: str
    created_at: str
