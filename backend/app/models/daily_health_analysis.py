import uuid

from sqlalchemy import Column, Date, DateTime, Float, Integer, String, UniqueConstraint, func, Index

from app.db.base import Base


class DailyHealthAnalysis(Base):
    __tablename__ = "daily_health_analyses"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    elder_user_id = Column(String, nullable=False, index=True)
    analysis_date = Column(Date, nullable=False, index=True)

    # 인지 WAV 일일 점수 (해당 날짜 probability 평균)
    cognitive_wav_score = Column(Float, nullable=True)
    # 우울 WAV 일일 점수
    depression_daily_score = Column(Float, nullable=True)
    # 불면 WAV 일일 점수
    insomnia_daily_score = Column(Float, nullable=True)

    # KoELECTRA 텍스트 점수 (나중에 사용)
    cognitive_text_score = Column(Float, nullable=True)
    # 통합 인지 점수 (wav + text 가중평균)
    cognitive_daily_score = Column(Float, nullable=True)

    utterance_count = Column(Integer, nullable=False, default=0)
    text_analysis_count = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("elder_user_id", "analysis_date", name="uq_daily_health_elder_date"),
    )


Index(
    "idx_daily_health_elder_date",
    DailyHealthAnalysis.elder_user_id,
    DailyHealthAnalysis.analysis_date.desc(),
)
