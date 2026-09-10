from datetime import datetime
from sqlalchemy import Column, String, DateTime

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    phone = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    birth = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    role = Column(String, nullable=False)  # elder / guardian
    password_hash = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
