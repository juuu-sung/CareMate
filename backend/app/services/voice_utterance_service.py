"""
발화 transcript 및 WAV 추론 결과를 DB에 저장한다.
"""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.voice_utterance import VoiceUtterance
from app.models.voice_health_analysis import VoiceHealthAnalysis
from app.services.wav_inference_service import WavInferenceResult, WavModelResult

logger = logging.getLogger(__name__)


def save_utterance_and_analysis(
    *,
    elder_user_id: str,
    transcript: str | None,
    audio_duration_sec: float | None,
    audio_format: str | None,
    session_id: str | None,
    wav_result: WavInferenceResult,
    text_result: WavModelResult | None = None,
) -> None:
    """
    BackgroundTask 에서 호출. 자체 DB 세션을 생성하고 완료 후 닫는다.
    """
    if not elder_user_id:
        return

    db = SessionLocal()
    try:
        _do_save(
            db=db,
            elder_user_id=elder_user_id,
            transcript=transcript,
            audio_duration_sec=audio_duration_sec,
            audio_format=audio_format,
            session_id=session_id,
            wav_result=wav_result,
            text_result=text_result,
        )
    except Exception:
        logger.exception(
            "voice utterance 저장 실패 elder_user_id=%s", elder_user_id
        )
        db.rollback()
    finally:
        db.close()


def _do_save(
    *,
    db: Session,
    elder_user_id: str,
    transcript: str | None,
    audio_duration_sec: float | None,
    audio_format: str | None,
    session_id: str | None,
    wav_result: WavInferenceResult,
    text_result: WavModelResult | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    utterance_id = str(uuid4())

    utterance = VoiceUtterance(
        id=utterance_id,
        elder_user_id=elder_user_id,
        transcript=transcript,
        audio_duration_sec=audio_duration_sec,
        audio_format=audio_format,
        session_id=session_id,
        recorded_at=now,
    )
    db.add(utterance)
    db.flush()

    c = wav_result.cognitive
    d = wav_result.depression
    i = wav_result.insomnia
    t = text_result

    analysis = VoiceHealthAnalysis(
        utterance_id=utterance_id,
        elder_user_id=elder_user_id,
        cognitive_wav_probability=c.probability,
        cognitive_wav_prediction=c.prediction,
        cognitive_wav_status=c.status,
        cognitive_wav_error=c.error,
        depression_wav_probability=d.probability,
        depression_wav_prediction=d.prediction,
        depression_wav_status=d.status,
        depression_wav_error=d.error,
        insomnia_wav_probability=i.probability,
        insomnia_wav_prediction=i.prediction,
        insomnia_wav_status=i.status,
        insomnia_wav_error=i.error,
        cognitive_text_probability=t.probability if t else None,
        cognitive_text_prediction=t.prediction if t else None,
        cognitive_text_status=t.status if t else "pending",
        cognitive_text_error=t.error if t else None,
        analyzed_at=now,
    )
    db.add(analysis)
    db.commit()

    logger.info(
        "voice utterance 저장 완료 elder_user_id=%s utterance_id=%s "
        "cog_wav=%.3f dep=%.3f ins=%.3f cog_text=%.3f",
        elder_user_id,
        utterance_id,
        c.probability if c.probability is not None else -1,
        d.probability if d.probability is not None else -1,
        i.probability if i.probability is not None else -1,
        t.probability if t and t.probability is not None else -1,
    )

    # 일별 집계 upsert (오류 무시)
    try:
        from app.services.daily_aggregation_service import upsert_daily_analysis
        upsert_daily_analysis(db, elder_user_id=elder_user_id, date=now.date())
    except Exception:
        logger.warning("일별 집계 upsert 실패 elder_user_id=%s", elder_user_id)
