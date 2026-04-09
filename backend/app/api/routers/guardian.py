from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.guardian import (
    GuardianSignupRequest,
    GuardianSignupResponse,
    ParentInfoByCodeResponse,
)
from app.services.guardian_service import create_guardian_and_link, get_parent_by_code

router = APIRouter(prefix="/guardians", tags=["guardians"])


@router.get("/by-code/{link_code}", response_model=ParentInfoByCodeResponse)
def read_parent_by_code(link_code: str, db: Session = Depends(get_db)):
    try:
        return get_parent_by_code(db, link_code)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/signup", response_model=GuardianSignupResponse)
def guardian_signup(payload: GuardianSignupRequest, db: Session = Depends(get_db)):
    try:
        return create_guardian_and_link(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))