from collections.abc import Generator
from dataclasses import dataclass
from typing import Literal

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.services.guardian_auth_service import (
    GuardianAuthenticationError,
    GuardianPrincipal,
    authenticate_guardian_session,
)
from app.services.elder_auth_service import (
    ElderAuthenticationError,
    ElderPrincipal,
    authenticate_elder_session,
)


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


session_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CarePrincipal:
    role: Literal["elder", "guardian"]
    session_id: str
    actor_user_id: str
    elder_user_id: str
    link_code: str | None = None


def _access_token(
    credentials: HTTPAuthorizationCredentials | None,
    detail: str,
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


def get_current_guardian(
    credentials: HTTPAuthorizationCredentials | None = Depends(session_bearer),
    db: Session = Depends(get_db),
) -> GuardianPrincipal:
    token = _access_token(credentials, "보호자 로그인이 필요합니다.")

    try:
        return authenticate_guardian_session(db, token)
    except GuardianAuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def get_optional_guardian(
    credentials: HTTPAuthorizationCredentials | None = Depends(session_bearer),
    db: Session = Depends(get_db),
) -> GuardianPrincipal | None:
    if credentials is None:
        return None

    token = _access_token(credentials, "로그인이 필요합니다.")
    try:
        return authenticate_guardian_session(db, token)
    except GuardianAuthenticationError:
        try:
            authenticate_elder_session(db, token)
            return None
        except ElderAuthenticationError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="세션이 만료되었거나 유효하지 않습니다.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc


def get_current_elder(
    credentials: HTTPAuthorizationCredentials | None = Depends(session_bearer),
    db: Session = Depends(get_db),
) -> ElderPrincipal:
    token = _access_token(credentials, "어르신 로그인이 필요합니다.")

    try:
        return authenticate_elder_session(db, token)
    except ElderAuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def get_current_care_principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(session_bearer),
    db: Session = Depends(get_db),
) -> CarePrincipal:
    token = _access_token(credentials, "로그인이 필요합니다.")

    try:
        elder = authenticate_elder_session(db, token)
        return CarePrincipal(
            role="elder",
            session_id=elder.session_id,
            actor_user_id=elder.elder_user_id,
            elder_user_id=elder.elder_user_id,
        )
    except ElderAuthenticationError:
        pass

    try:
        guardian = authenticate_guardian_session(db, token)
        return CarePrincipal(
            role="guardian",
            session_id=guardian.session_id,
            actor_user_id=guardian.guardian_user_id,
            elder_user_id=guardian.elder_user_id,
            link_code=guardian.link_code,
        )
    except GuardianAuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="세션이 만료되었거나 유효하지 않습니다.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def require_elder_access(
    principal: CarePrincipal,
    *requested_elder_user_ids: str | None,
) -> str:
    requested_ids = {
        value.strip()
        for value in requested_elder_user_ids
        if value is not None and value.strip()
    }

    if len(requested_ids) > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="서로 다른 어르신 ID를 함께 요청할 수 없습니다.",
        )

    target_elder_user_id = next(iter(requested_ids), principal.elder_user_id)
    if target_elder_user_id != principal.elder_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="다른 사용자의 돌봄정보에는 접근할 수 없습니다.",
        )

    return target_elder_user_id
