from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.guardian_link import GuardianLink
from app.models.guardian_session import GuardianSession


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


_PASSWORD_SCRYPT_N = 2**14
_PASSWORD_SCRYPT_R = 8
_PASSWORD_SCRYPT_P = 1
_PASSWORD_SCRYPT_DKLEN = 32
_PASSWORD_SCRYPT_MAXMEM = 64 * 1024 * 1024


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_guardian_password(password: str) -> str:
    if len(password) < 8 or len(password) > 128:
        raise GuardianAuthenticationError("비밀번호는 8자 이상 128자 이하로 입력해 주세요.")

    salt = secrets.token_bytes(16)
    derived_key = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_PASSWORD_SCRYPT_N,
        r=_PASSWORD_SCRYPT_R,
        p=_PASSWORD_SCRYPT_P,
        dklen=_PASSWORD_SCRYPT_DKLEN,
        maxmem=_PASSWORD_SCRYPT_MAXMEM,
    )
    encoded_salt = base64.urlsafe_b64encode(salt).decode("ascii")
    encoded_key = base64.urlsafe_b64encode(derived_key).decode("ascii")
    return (
        f"scrypt${_PASSWORD_SCRYPT_N}${_PASSWORD_SCRYPT_R}"
        f"${_PASSWORD_SCRYPT_P}${encoded_salt}${encoded_key}"
    )


def verify_guardian_password(password: str, encoded_hash: str | None) -> bool:
    if not encoded_hash:
        return False

    try:
        algorithm, n_value, r_value, p_value, encoded_salt, encoded_key = encoded_hash.split("$")
        if algorithm != "scrypt":
            return False
        n = int(n_value)
        r = int(r_value)
        p = int(p_value)
        if (n, r, p) != (_PASSWORD_SCRYPT_N, _PASSWORD_SCRYPT_R, _PASSWORD_SCRYPT_P):
            return False
        salt = base64.urlsafe_b64decode(encoded_salt.encode("ascii"))
        expected_key = base64.urlsafe_b64decode(encoded_key.encode("ascii"))
        actual_key = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=n,
            r=r,
            p=p,
            dklen=len(expected_key),
            maxmem=_PASSWORD_SCRYPT_MAXMEM,
        )
    except (binascii.Error, TypeError, ValueError):
        return False

    return hmac.compare_digest(actual_key, expected_key)


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
