from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.parent import (
    ParentCareInfoUpdateRequest,
    ParentLoginRequest,
    ParentLoginResponse,
    ParentSignupRequest,
)
from app.services.parent_service import (
    create_parent,
    get_parent_by_code,
    login_parent,
    update_parent_care_info,
)

router = APIRouter(prefix="/parents", tags=["parents"])


@router.get("/test")
def parent_test():
    return {"message": "parents router ok"}


@router.post("/signup")
def parent_signup(payload: ParentSignupRequest, db: Session = Depends(get_db)):
    try:
        return create_parent(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=ParentLoginResponse)
def parent_login(payload: ParentLoginRequest, db: Session = Depends(get_db)):
    try:
        return login_parent(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/by-code/{link_code}")
def parent_by_code(link_code: str, db: Session = Depends(get_db)):
    try:
        return get_parent_by_code(db, link_code)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/{parent_user_id}/care-info")
def parent_care_info_update(
    parent_user_id: str,
    payload: ParentCareInfoUpdateRequest,
    db: Session = Depends(get_db),
):
    try:
        return update_parent_care_info(db, parent_user_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
