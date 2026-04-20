from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.guardian import (
    GuardianAlertsResponse,
    GuardianConversationsResponse,
    GuardianDashboardResponse,
    GuardianScheduleCreateRequest,
    GuardianScheduleDeleteResponse,
    GuardianScheduleItem,
    GuardianSchedulesResponse,
    GuardianScheduleUpdateRequest,
    GuardianLoginRequest,
    GuardianLoginResponse,
    GuardianSignupRequest,
    GuardianSignupResponse,
    ParentInfoByCodeResponse,
)
from app.services.guardian_service import (
    create_guardian_and_link,
    create_guardian_schedule,
    delete_guardian_schedule,
    get_parent_by_code,
    get_guardian_dashboard,
    list_guardian_alerts,
    list_guardian_conversations,
    list_guardian_schedules,
    login_guardian,
    update_guardian_schedule,
)

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


@router.post("/login", response_model=GuardianLoginResponse)
def guardian_login(payload: GuardianLoginRequest, db: Session = Depends(get_db)):
    try:
        return login_guardian(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/dashboard", response_model=GuardianDashboardResponse)
def read_guardian_dashboard(
    elder_user_id: str = Query(...),
    link_code: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return get_guardian_dashboard(db, elder_user_id=elder_user_id, link_code=link_code)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/alerts", response_model=GuardianAlertsResponse)
def read_guardian_alerts(
    elder_user_id: str = Query(...),
    link_code: str = Query(...),
    limit: int = Query(3, ge=1, le=10),
    db: Session = Depends(get_db),
):
    try:
        return {
            "items": list_guardian_alerts(
                db,
                elder_user_id=elder_user_id,
                link_code=link_code,
                limit=limit,
            )
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/conversations", response_model=GuardianConversationsResponse)
def read_guardian_conversations(
    elder_user_id: str = Query(...),
    link_code: str = Query(...),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    try:
        return {
            "items": list_guardian_conversations(
                db,
                elder_user_id=elder_user_id,
                link_code=link_code,
                limit=limit,
            )
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/schedules", response_model=GuardianSchedulesResponse)
def read_guardian_schedules(
    elder_user_id: str = Query(...),
    link_code: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return {
            "items": list_guardian_schedules(
                db,
                elder_user_id=elder_user_id,
                link_code=link_code,
            )
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/schedules", response_model=GuardianScheduleItem)
def create_schedule_for_guardian(
    payload: GuardianScheduleCreateRequest,
    elder_user_id: str = Query(...),
    link_code: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return create_guardian_schedule(
            db,
            elder_user_id=elder_user_id,
            link_code=link_code,
            payload=payload,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/schedules/{schedule_id}", response_model=GuardianScheduleItem)
def update_schedule_for_guardian(
    schedule_id: str,
    payload: GuardianScheduleUpdateRequest,
    elder_user_id: str = Query(...),
    link_code: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return update_guardian_schedule(
            db,
            elder_user_id=elder_user_id,
            link_code=link_code,
            schedule_id=schedule_id,
            payload=payload,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/schedules/{schedule_id}", response_model=GuardianScheduleDeleteResponse)
def delete_schedule_for_guardian(
    schedule_id: str,
    elder_user_id: str = Query(...),
    link_code: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return delete_guardian_schedule(
            db,
            elder_user_id=elder_user_id,
            link_code=link_code,
            schedule_id=schedule_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
