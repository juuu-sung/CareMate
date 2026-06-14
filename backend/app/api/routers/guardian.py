from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
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
from app.schemas.alerts import AlertItem, AlertStatusUpdateRequest
from app.schemas.safety_zone import (
    SafetyZoneCreateRequest,
    SafetyZoneDeleteResponse,
    SafetyZoneItem,
    SafetyZoneListResponse,
    SafetyZoneUpdateRequest,
)
from app.services.guardian_service import (
    create_guardian_and_link,
    create_guardian_schedule,
    delete_guardian_schedule,
    get_parent_by_code,
    get_guardian_dashboard,
    list_guardian_alerts,
    list_guardian_alert_history,
    list_guardian_conversations,
    list_guardian_schedules,
    login_guardian,
    update_guardian_alert_for_guardian,
    update_guardian_schedule,
)
from app.services.safety_zone_service import (
    create_safety_zone,
    delete_safety_zone,
    list_safety_zones,
    update_safety_zone,
)
from app.services.openai_service import generate_health_explanation

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


@router.get("/alert-history", response_model=GuardianAlertsResponse)
def read_guardian_alert_history(
    elder_user_id: str = Query(...),
    link_code: str = Query(...),
    limit: int = Query(120, ge=1, le=180),
    db: Session = Depends(get_db),
):
    try:
        return {
            "items": list_guardian_alert_history(
                db,
                elder_user_id=elder_user_id,
                link_code=link_code,
                limit=limit,
            )
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/safety-zones", response_model=SafetyZoneListResponse)
def read_safety_zones(
    elder_user_id: str = Query(...),
    link_code: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return {
            "items": list_safety_zones(
                db,
                elder_user_id=elder_user_id,
                link_code=link_code,
            )
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/safety-zones", response_model=SafetyZoneItem)
def create_safety_zone_for_guardian(
    payload: SafetyZoneCreateRequest,
    elder_user_id: str = Query(...),
    link_code: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return create_safety_zone(
            db,
            elder_user_id=elder_user_id,
            link_code=link_code,
            payload=payload,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/safety-zones/{zone_id}", response_model=SafetyZoneItem)
def update_safety_zone_for_guardian(
    zone_id: str,
    payload: SafetyZoneUpdateRequest,
    elder_user_id: str = Query(...),
    link_code: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return update_safety_zone(
            db,
            elder_user_id=elder_user_id,
            link_code=link_code,
            zone_id=zone_id,
            payload=payload,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/safety-zones/{zone_id}", response_model=SafetyZoneDeleteResponse)
def delete_safety_zone_for_guardian(
    zone_id: str,
    elder_user_id: str = Query(...),
    link_code: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return delete_safety_zone(
            db,
            elder_user_id=elder_user_id,
            link_code=link_code,
            zone_id=zone_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/alerts/{alert_id}", response_model=AlertItem)
def update_guardian_alert(
    alert_id: str,
    payload: AlertStatusUpdateRequest,
    elder_user_id: str = Query(...),
    link_code: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return update_guardian_alert_for_guardian(
            db,
            elder_user_id=elder_user_id,
            link_code=link_code,
            alert_id=alert_id,
            status=payload.status,
            alert_type=payload.type,
            message=payload.message,
            created_at=payload.created_at,
        )
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
            "days": list_guardian_conversations(
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


class HealthExplainItem(BaseModel):
    date: str
    value: float


class HealthExplainRequest(BaseModel):
    metric: str
    items: list[HealthExplainItem]
    elder_name: str


@router.post("/health-explain")
def explain_health_metric(payload: HealthExplainRequest):
    explanation = generate_health_explanation(
        metric=payload.metric,
        items=[item.model_dump() for item in payload.items],
        elder_name=payload.elder_name,
    )
    return {"explanation": explanation}
