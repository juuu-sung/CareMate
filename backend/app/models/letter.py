from sqlalchemy import Column, String, DateTime, Text
from app.db.base import Base

class Letter(Base):
    __tablename__ = "letters"

    guardian_user_id = Column(String, primary_key=True, index=True)
    elder_user_id = Column(String, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), primary_key=True, index=True)
    link_code = Column(String, primary_key=True, index=True)
    sender_role = Column(String, nullable=False)