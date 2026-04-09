from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey

from app.db.base import Base


class GuardianLink(Base):
    __tablename__ = "guardian_links"

    id = Column(String, primary_key=True, index=True)
    guardian_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    elder_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    link_code = Column(String, unique=True, nullable=False, index=True)
    is_used = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )