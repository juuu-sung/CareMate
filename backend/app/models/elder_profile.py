from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey

from app.db.base import Base


class ElderProfile(Base):
    __tablename__ = "elder_profiles"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, unique=True)

    address = Column(String, nullable=True, default="")
    medications = Column(String, nullable=True, default="")
    diseases = Column(String, nullable=True, default="")
    allergies = Column(String, nullable=True, default="")
    hospital = Column(String, nullable=True, default="")
    doctor_contact = Column(String, nullable=True, default="")
    memo = Column(String, nullable=True, default="")

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )