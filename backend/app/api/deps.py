from collections.abc import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.services.guardian_auth_service import (
    GuardianAuthenticationError,
    GuardianPrincipal,
    authenticate_guardian_session,
)


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


guardian_bearer = HTTPBearer(auto_error=False)


def get_current_guardian(
    credentials: HTTPAuthorizationCredentials | None = Depends(guardian_bearer),
    db: Session = Depends(get_db),
) -> GuardianPrincipal:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="보호자 로그인이 필요합니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return authenticate_guardian_session(db, credentials.credentials)
    except GuardianAuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def get_optional_guardian(
    credentials: HTTPAuthorizationCredentials | None = Depends(guardian_bearer),
    db: Session = Depends(get_db),
) -> GuardianPrincipal | None:
    if credentials is None:
        return None
    return get_current_guardian(credentials, db)
