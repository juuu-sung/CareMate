from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, Text
from app.db.base import Base


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Letter(Base):
    __tablename__ = "letters"

    guardian_user_id = Column(String, primary_key=True, index=True)
    elder_user_id = Column(String, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), primary_key=True, index=True, default=_utc_now)
    link_code = Column(String, primary_key=True, index=True)
    sender_role = Column(String, nullable=False)
