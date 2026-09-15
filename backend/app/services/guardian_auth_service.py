from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.guardian_link import GuardianLink
from app.models.guardian_session import GuardianSession
from app.services.password_service import (
    PasswordValidationError,
    hash_password,
    verify_password,
)


class GuardianAuthenticationError(ValueError):
    pass


@dataclass(frozen=True)
class GuardianPrincipal:
    session_id: str
    guardian_user_id: str
    elder_user_id: str
    guardian_link_id: str
    link_code: str


@dataclass(frozen=True)
class IssuedGuardianSession:
    access_token: str
    expires_at: datetime
    link_id: str


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_guardian_password(password: str) -> str:
    try:
        return hash_password(password)
    except PasswordValidationError as exc:
        raise GuardianAuthenticationError(str(exc)) from exc


def verify_guardian_password(password: str, encoded_hash: str | None) -> bool:
    return verify_password(password, encoded_hash)


def issue_guardian_session(db: Session, link: GuardianLink) -> IssuedGuardianSession:
    if not link.guardian_user_id:
        raise GuardianAuthenticationError("연동된 보호자 정보를 찾을 수 없습니다.")

    access_token = secrets.token_urlsafe(48)
    expires_at = _utc_now() + timedelta(minutes=settings.guardian_session_ttl_minutes)
    session = GuardianSession(
        id=str(uuid4()),
        token_hash=_hash_token(access_token),
        guardian_user_id=str(link.guardian_user_id),
        guardian_link_id=str(link.id),
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()

    return IssuedGuardianSession(
        access_token=access_token,
        expires_at=expires_at,
        link_id=str(link.id),
    )


def authenticate_guardian_session(db: Session, access_token: str) -> GuardianPrincipal:
    normalized_token = (access_token or "").strip()
    if len(normalized_token) < 32:
        raise GuardianAuthenticationError("유효하지 않은 보호자 세션입니다.")

    session = (
        db.query(GuardianSession)
        .filter(GuardianSession.token_hash == _hash_token(normalized_token))
        .first()
    )
    now = _utc_now()
    if not session or session.revoked_at is not None or _as_utc(session.expires_at) <= now:
        raise GuardianAuthenticationError("보호자 세션이 만료되었거나 유효하지 않습니다.")

    link = (
        db.query(GuardianLink)
        .filter(GuardianLink.id == session.guardian_link_id)
        .first()
    )
    if (
        not link
        or not link.is_used
        or not link.guardian_user_id
        or str(link.guardian_user_id) != str(session.guardian_user_id)
    ):
        raise GuardianAuthenticationError("보호자 연결이 해제되었습니다.")

    if now - _as_utc(session.last_used_at) >= timedelta(minutes=5):
        session.last_used_at = now
        db.commit()

    return GuardianPrincipal(
        session_id=str(session.id),
        guardian_user_id=str(session.guardian_user_id),
        elder_user_id=str(link.elder_user_id),
        guardian_link_id=str(link.id),
        link_code=str(link.link_code),
    )


def revoke_guardian_session(db: Session, access_token: str) -> None:
    normalized_token = (access_token or "").strip()
    if not normalized_token:
        return

    session = (
        db.query(GuardianSession)
        .filter(GuardianSession.token_hash == _hash_token(normalized_token))
        .first()
    )
    if session and session.revoked_at is None:
        session.revoked_at = _utc_now()
        db.commit()


def revoke_guardian_session_by_id(db: Session, session_id: str) -> None:
    session = db.query(GuardianSession).filter(GuardianSession.id == session_id).first()
    if session and session.revoked_at is None:
        session.revoked_at = _utc_now()
        db.commit()
