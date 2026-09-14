from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String

from app.db.base import Base


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ElderSession(Base):
    __tablename__ = "elder_sessions"

    id = Column(String, primary_key=True, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    elder_user_id = Column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utc_now)
    last_used_at = Column(DateTime(timezone=True), nullable=False, default=_utc_now)
