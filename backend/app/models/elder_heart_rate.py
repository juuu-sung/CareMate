import uuid

from sqlalchemy import Column, DateTime, Float, String, func, Index

from app.db.base import Base


class ElderHeartRate(Base):
    __tablename__ = "elder_heart_rates"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    elder_user_id = Column(String, nullable=False, index=True)

    heart_rate = Column(Float, nullable=False)

    measured_at = Column(DateTime(timezone=True), nullable=False, index=True)

    source = Column(String, nullable=True, default="Apple Watch")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


Index(
    "idx_elder_heart_rates_user_measured_at",
    ElderHeartRate.elder_user_id,
    ElderHeartRate.measured_at.desc(),
)