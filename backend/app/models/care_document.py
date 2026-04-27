# app/models/care_document.py

from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Text

from app.db.base import Base


class CareDocument(Base):
    __tablename__ = "care_documents"

    id = Column(String, primary_key=True, index=True)
    elder_user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    # prescription, disease, allergy
    document_type = Column(String, nullable=False)

    image_path = Column(String, nullable=False)
    summary = Column(Text, nullable=True, default="")

    created_at = Column(DateTime, default=datetime.utcnow)