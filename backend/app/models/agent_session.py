from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, String, Text

from app.db.base import Base


class AgentSession(Base):
    __tablename__ = "agent_sessions"

    session_id = Column(String, primary_key=True, index=True)
    mode = Column(String, nullable=False)
    pending_action = Column(String, nullable=False)
    slots_json = Column(Text, nullable=False, default="{}")
    awaiting_confirmation = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
