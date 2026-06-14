import uuid

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, func, Index

from app.db.base import Base


class VoiceHealthAnalysis(Base):
    __tablename__ = "voice_health_analyses"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    utterance_id = Column(String, ForeignKey("voice_utterances.id"), nullable=False, index=True)
    elder_user_id = Column(String, nullable=False, index=True)

    # 인지기능 WAV
    cognitive_wav_probability = Column(Float, nullable=True)
    cognitive_wav_prediction = Column(Integer, nullable=True)
    cognitive_wav_status = Column(String(16), nullable=False, default="pending")
    cognitive_wav_error = Column(Text, nullable=True)

    # 우울 WAV
    depression_wav_probability = Column(Float, nullable=True)
    depression_wav_prediction = Column(Integer, nullable=True)
    depression_wav_status = Column(String(16), nullable=False, default="pending")
    depression_wav_error = Column(Text, nullable=True)

    # 불면 WAV
    insomnia_wav_probability = Column(Float, nullable=True)
    insomnia_wav_prediction = Column(Integer, nullable=True)
    insomnia_wav_status = Column(String(16), nullable=False, default="pending")
    insomnia_wav_error = Column(Text, nullable=True)

    # 인지기능 텍스트 (KoELECTRA)
    cognitive_text_probability = Column(Float, nullable=True)
    cognitive_text_prediction = Column(Integer, nullable=True)
    cognitive_text_status = Column(String(16), nullable=False, default="pending")
    cognitive_text_error = Column(Text, nullable=True)

    model_version = Column(String(64), nullable=True, default="wav_v1")
    analyzed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


Index(
    "idx_voice_health_analyses_elder_created",
    VoiceHealthAnalysis.elder_user_id,
    VoiceHealthAnalysis.created_at.desc(),
)
