from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.elder_session import ElderSession
from app.models.user import User


class ElderAuthenticationError(ValueError):
    pass


@dataclass(frozen=True)
class ElderPrincipal:
    session_id: str
    elder_user_id: str


@dataclass(frozen=True)
class IssuedElderSession:
    access_token: str
    expires_at: datetime


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_elder_session(db: Session, elder_user: User) -> IssuedElderSession:
    if elder_user.role != "elder":
        raise ElderAuthenticationError("어르신 계정만 세션을 만들 수 있습니다.")

    access_token = secrets.token_urlsafe(48)
    expires_at = _utc_now() + timedelta(minutes=settings.elder_session_ttl_minutes)
    session = ElderSession(
        id=str(uuid4()),
        token_hash=_hash_token(access_token),
        elder_user_id=str(elder_user.id),
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()

    return IssuedElderSession(access_token=access_token, expires_at=expires_at)


def authenticate_elder_session(db: Session, access_token: str) -> ElderPrincipal:
    normalized_token = (access_token or "").strip()
    if len(normalized_token) < 32:
        raise ElderAuthenticationError("유효하지 않은 어르신 세션입니다.")

    session = (
        db.query(ElderSession)
        .filter(ElderSession.token_hash == _hash_token(normalized_token))
        .first()
    )
    now = _utc_now()
    if not session or session.revoked_at is not None or _as_utc(session.expires_at) <= now:
        raise ElderAuthenticationError("어르신 세션이 만료되었거나 유효하지 않습니다.")

    elder_user = db.query(User).filter(User.id == session.elder_user_id).first()
    if not elder_user or elder_user.role != "elder":
        raise ElderAuthenticationError("어르신 계정을 찾을 수 없습니다.")

    if now - _as_utc(session.last_used_at) >= timedelta(minutes=5):
        session.last_used_at = now
        db.commit()

    return ElderPrincipal(
        session_id=str(session.id),
        elder_user_id=str(session.elder_user_id),
    )


def revoke_elder_session_by_id(db: Session, session_id: str) -> None:
    session = db.query(ElderSession).filter(ElderSession.id == session_id).first()
    if session and session.revoked_at is None:
        session.revoked_at = _utc_now()
        db.commit()
