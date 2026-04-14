import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.schemas.agent import AgentSessionState, AgentSlots


def get_session(db: Session, session_id: str | None) -> AgentSessionState | None:
    if not session_id:
        return None

    row = db.execute(
        text(
            """
            SELECT session_id, mode, pending_action, slots_json, awaiting_confirmation, updated_at
            FROM agent_sessions
            WHERE session_id = :session_id
            """
        ),
        {"session_id": session_id},
    ).mappings().first()

    if not row:
        return None

    updated_at = row["updated_at"]
    if updated_at and _is_expired(updated_at):
        clear_session(db, session_id)
        return None

    return AgentSessionState(
        session_id=row["session_id"],
        mode=row["mode"],
        pending_action=row["pending_action"],
        slots=AgentSlots(**json.loads(row["slots_json"])),
        awaiting_confirmation=row["awaiting_confirmation"],
    )


def save_session(db: Session, session: AgentSessionState) -> None:
    db.execute(
        text(
            """
            INSERT INTO agent_sessions (
                session_id,
                mode,
                pending_action,
                slots_json,
                awaiting_confirmation
            )
            VALUES (
                :session_id,
                :mode,
                :pending_action,
                :slots_json,
                :awaiting_confirmation
            )
            ON CONFLICT (session_id)
            DO UPDATE SET
                mode = EXCLUDED.mode,
                pending_action = EXCLUDED.pending_action,
                slots_json = EXCLUDED.slots_json,
                awaiting_confirmation = EXCLUDED.awaiting_confirmation,
                updated_at = NOW()
            """
        ),
        {
            "session_id": session.session_id,
            "mode": session.mode,
            "pending_action": session.pending_action,
            "slots_json": json.dumps(session.slots.model_dump(), ensure_ascii=False),
            "awaiting_confirmation": session.awaiting_confirmation,
        },
    )
    db.commit()


def clear_session(db: Session, session_id: str | None) -> None:
    if not session_id:
        return

    db.execute(
        text(
            """
            DELETE FROM agent_sessions
            WHERE session_id = :session_id
            """
        ),
        {"session_id": session_id},
    )
    db.commit()


def clear_expired_sessions(db: Session) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=settings.agent_session_ttl_minutes)
    result = db.execute(
        text(
            """
            DELETE FROM agent_sessions
            WHERE updated_at < :cutoff
            """
        ),
        {"cutoff": cutoff},
    )
    db.commit()
    return result.rowcount or 0


def _is_expired(updated_at: datetime) -> bool:
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=settings.agent_session_ttl_minutes)
    return updated_at < cutoff
