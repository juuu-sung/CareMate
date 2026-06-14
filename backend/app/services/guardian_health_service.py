"""
보호자 건강 분석 데이터 조회 서비스.
권한 검증은 guardian_service._get_guardian_link 재사용.
"""

import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)
SEOUL_TZ = ZoneInfo("Asia/Seoul")

MAX_RANGE_DAYS = 90


def get_daily_health_analysis(
    db: Session,
    *,
    elder_user_id: str,
    link_code: str,
    start_date: date,
    end_date: date,
) -> dict:
    from app.services.guardian_service import validate_guardian_access
    validate_guardian_access(db, elder_user_id=elder_user_id, link_code=link_code)

    if end_date < start_date:
        start_date, end_date = end_date, start_date

    if (end_date - start_date).days > MAX_RANGE_DAYS:
        start_date = end_date - timedelta(days=MAX_RANGE_DAYS)

    rows = db.execute(
        text(
            """
            SELECT
                analysis_date,
                cognitive_wav_score,
                cognitive_text_score,
                cognitive_daily_score,
                depression_daily_score,
                insomnia_daily_score,
                utterance_count,
                text_analysis_count
            FROM daily_health_analyses
            WHERE elder_user_id = :elder_user_id
              AND analysis_date BETWEEN :start_date AND :end_date
            ORDER BY analysis_date ASC
            """
        ),
        {
            "elder_user_id": elder_user_id,
            "start_date": start_date,
            "end_date": end_date,
        },
    ).mappings().all()

    items = []
    for row in rows:
        cog = row["cognitive_daily_score"]
        dep = row["depression_daily_score"]
        ins = row["insomnia_daily_score"]
        has_data = any(v is not None for v in [cog, dep, ins])
        items.append(
            {
                "date": row["analysis_date"].isoformat(),
                "cognitive_score": _round_or_none(cog),
                "cognitive_wav_score": _round_or_none(row["cognitive_wav_score"]),
                "cognitive_text_score": _round_or_none(row["cognitive_text_score"]),
                "depression_score": _round_or_none(dep),
                "insomnia_score": _round_or_none(ins),
                "utterance_count": int(row["utterance_count"] or 0),
                "text_analysis_count": int(row["text_analysis_count"] or 0),
                "has_data": has_data,
            }
        )

    return {
        "elder_user_id": elder_user_id,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "items": items,
    }


def get_utterance_health_analysis(
    db: Session,
    *,
    elder_user_id: str,
    link_code: str,
    limit: int = 40,
) -> dict:
    from app.services.guardian_service import validate_guardian_access
    validate_guardian_access(db, elder_user_id=elder_user_id, link_code=link_code)

    rows = db.execute(
        text(
            """
            SELECT
                vu.id,
                vu.recorded_at,
                vu.session_id,
                vu.transcript,
                vha.depression_wav_probability,
                vha.insomnia_wav_probability,
                vha.cognitive_wav_probability,
                vha.cognitive_text_probability,
                vha.cognitive_wav_status,
                vha.cognitive_text_status
            FROM voice_utterances vu
            JOIN voice_health_analyses vha ON vha.utterance_id = vu.id
            WHERE vu.elder_user_id = :elder_user_id
              AND (
                vha.depression_wav_status = 'ok'
                OR vha.insomnia_wav_status = 'ok'
                OR vha.cognitive_wav_status = 'ok'
                OR vha.cognitive_text_status = 'ok'
              )
            ORDER BY vu.recorded_at DESC
            LIMIT :limit
            """
        ),
        {"elder_user_id": elder_user_id, "limit": limit},
    ).mappings().all()

    items = []
    for row in rows:
        dep = row["depression_wav_probability"]
        ins = row["insomnia_wav_probability"]
        cog_wav = row["cognitive_wav_probability"]
        cog_text = row["cognitive_text_probability"]

        if not any(v is not None for v in [dep, ins, cog_wav, cog_text]):
            continue

        transcript = row["transcript"] or ""
        recorded_at = row["recorded_at"]
        items.append(
            {
                "id": row["id"],
                "recorded_at": recorded_at.isoformat() if recorded_at else None,
                "session_id": row["session_id"],
                "depression_score": _round_or_none(dep),
                "insomnia_score": _round_or_none(ins),
                "cognitive_score": _round_or_none(cog_wav),
                "cognitive_text_score": _round_or_none(cog_text),
                "transcript_preview": transcript[:60] if transcript else None,
            }
        )

    items.reverse()

    return {
        "elder_user_id": elder_user_id,
        "items": items,
    }


def _round_or_none(value) -> float | None:
    if value is None:
        return None
    return round(float(value), 4)
