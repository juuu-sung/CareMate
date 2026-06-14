"""
날짜별 WAV 분석 결과를 집계하여 daily_health_analyses에 upsert한다.
"""

import logging
from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings

logger = logging.getLogger(__name__)


def _compute_cognitive_daily_score(
    wav_score: float | None,
    text_score: float | None,
) -> float | None:
    """
    인지 WAV + 텍스트 점수 통합.
    둘 다 없으면 None, 하나만 있으면 그 값 사용.
    """
    wav_w = settings.COGNITIVE_WAV_DAILY_WEIGHT
    text_w = settings.COGNITIVE_TEXT_DAILY_WEIGHT

    if wav_score is not None and text_score is not None:
        return round(wav_score * wav_w + text_score * text_w, 6)
    if wav_score is not None:
        return wav_score
    if text_score is not None:
        return text_score
    return None


def upsert_daily_analysis(
    db: Session,
    *,
    elder_user_id: str,
    date: date,
) -> None:
    """
    elder_user_id + analysis_date 기준으로 당일 집계를 계산하고 upsert한다.
    """
    rows = db.execute(
        text(
            """
            SELECT
                vha.cognitive_wav_probability,
                vha.depression_wav_probability,
                vha.insomnia_wav_probability,
                vha.cognitive_text_probability,
                vha.cognitive_wav_status,
                vha.depression_wav_status,
                vha.insomnia_wav_status,
                vha.cognitive_text_status
            FROM voice_health_analyses vha
            JOIN voice_utterances vu ON vu.id = vha.utterance_id
            WHERE vu.elder_user_id = :elder_user_id
              AND DATE(vu.recorded_at AT TIME ZONE 'Asia/Seoul') = :analysis_date
            """
        ),
        {"elder_user_id": elder_user_id, "analysis_date": date},
    ).mappings().all()

    if not rows:
        return

    cog_probs = [r["cognitive_wav_probability"] for r in rows if r["cognitive_wav_status"] == "ok" and r["cognitive_wav_probability"] is not None]
    dep_probs = [r["depression_wav_probability"] for r in rows if r["depression_wav_status"] == "ok" and r["depression_wav_probability"] is not None]
    ins_probs = [r["insomnia_wav_probability"] for r in rows if r["insomnia_wav_status"] == "ok" and r["insomnia_wav_probability"] is not None]
    cog_text_probs = [r["cognitive_text_probability"] for r in rows if r.get("cognitive_text_status") == "ok" and r["cognitive_text_probability"] is not None]

    cog_wav_score = (sum(cog_probs) / len(cog_probs)) if cog_probs else None
    dep_score = (sum(dep_probs) / len(dep_probs)) if dep_probs else None
    ins_score = (sum(ins_probs) / len(ins_probs)) if ins_probs else None
    cog_text_score = (sum(cog_text_probs) / len(cog_text_probs)) if cog_text_probs else None
    cog_daily = _compute_cognitive_daily_score(cog_wav_score, cog_text_score)

    utterance_count = len(rows)
    text_analysis_count = len(cog_text_probs)

    db.execute(
        text(
            """
            INSERT INTO daily_health_analyses (
                id, elder_user_id, analysis_date,
                cognitive_wav_score, cognitive_text_score,
                depression_daily_score, insomnia_daily_score,
                cognitive_daily_score, utterance_count, text_analysis_count,
                created_at, updated_at
            )
            VALUES (
                :id, :elder_user_id, :analysis_date,
                :cog_wav, :cog_text,
                :dep, :ins,
                :cog_daily, :utterance_count, :text_analysis_count,
                now(), now()
            )
            ON CONFLICT (elder_user_id, analysis_date)
            DO UPDATE SET
                cognitive_wav_score    = EXCLUDED.cognitive_wav_score,
                cognitive_text_score   = EXCLUDED.cognitive_text_score,
                depression_daily_score = EXCLUDED.depression_daily_score,
                insomnia_daily_score   = EXCLUDED.insomnia_daily_score,
                cognitive_daily_score  = EXCLUDED.cognitive_daily_score,
                utterance_count        = EXCLUDED.utterance_count,
                text_analysis_count    = EXCLUDED.text_analysis_count,
                updated_at             = now()
            """
        ),
        {
            "id": str(uuid4()),
            "elder_user_id": elder_user_id,
            "analysis_date": date,
            "cog_wav": cog_wav_score,
            "cog_text": cog_text_score,
            "dep": dep_score,
            "ins": ins_score,
            "cog_daily": cog_daily,
            "utterance_count": utterance_count,
            "text_analysis_count": text_analysis_count,
        },
    )
    db.commit()
    logger.info(
        "daily_health_analyses upsert elder_user_id=%s date=%s cog_wav=%.3f cog_text=%.3f dep=%.3f ins=%.3f",
        elder_user_id,
        date,
        cog_wav_score if cog_wav_score is not None else -1,
        cog_text_score if cog_text_score is not None else -1,
        dep_score if dep_score is not None else -1,
        ins_score if ins_score is not None else -1,
    )
