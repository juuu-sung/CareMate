import uuid

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, func, Index

from app.db.base import Base


class VoiceUtterance(Base):
    __tablename__ = "voice_utterances"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    elder_user_id = Column(String, nullable=False, index=True)

    transcript = Column(Text, nullable=True)
    audio_duration_sec = Column(Float, nullable=True)
    audio_format = Column(String(16), nullable=True)

    # chat_log와 연결 (optional)
    session_id = Column(String, nullable=True)

    recorded_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # KoELECTRA 배치 분석 상태 (나중에 사용)
    text_batch_id = Column(String, nullable=True)
    text_analyzed_at = Column(DateTime(timezone=True), nullable=True)


Index(
    "idx_voice_utterances_elder_recorded",
    VoiceUtterance.elder_user_id,
    VoiceUtterance.recorded_at.desc(),
)

Index(
    "idx_voice_utterances_not_analyzed",
    VoiceUtterance.elder_user_id,
    VoiceUtterance.text_analyzed_at,
)
