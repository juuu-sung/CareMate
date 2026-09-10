from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_guardian
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
    get_guardian_dashboard,
    list_guardian_alerts,
    list_guardian_alert_history,
    list_guardian_conversations,
    list_guardian_schedules,
    login_guardian,
    update_guardian_alert_for_guardian,
    update_guardian_schedule,
)
from app.services.guardian_auth_service import GuardianPrincipal, revoke_guardian_session_by_id
from app.services.safety_zone_service import (
    create_safety_zone,
    delete_safety_zone,
    list_safety_zones,
    update_safety_zone,
)
from app.services.openai_service import generate_health_explanation

router = APIRouter(prefix="/guardians", tags=["guardians"])


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
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def guardian_logout(
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
) -> Response:
    revoke_guardian_session_by_id(db, principal.session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/dashboard", response_model=GuardianDashboardResponse)
def read_guardian_dashboard(
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    try:
        return get_guardian_dashboard(
            db,
            elder_user_id=principal.elder_user_id,
            link_code=principal.link_code,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/alerts", response_model=GuardianAlertsResponse)
def read_guardian_alerts(
    limit: int = Query(3, ge=1, le=10),
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    try:
        return {
            "items": list_guardian_alerts(
                db,
                elder_user_id=principal.elder_user_id,
                link_code=principal.link_code,
                limit=limit,
            )
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/alert-history", response_model=GuardianAlertsResponse)
def read_guardian_alert_history(
    limit: int = Query(120, ge=1, le=180),
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    try:
        return {
            "items": list_guardian_alert_history(
                db,
                elder_user_id=principal.elder_user_id,
                link_code=principal.link_code,
                limit=limit,
            )
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/safety-zones", response_model=SafetyZoneListResponse)
def read_safety_zones(
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    try:
        return {
            "items": list_safety_zones(
                db,
                elder_user_id=principal.elder_user_id,
                link_code=principal.link_code,
            )
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/safety-zones", response_model=SafetyZoneItem)
def create_safety_zone_for_guardian(
    payload: SafetyZoneCreateRequest,
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    try:
        return create_safety_zone(
            db,
            elder_user_id=principal.elder_user_id,
            link_code=principal.link_code,
            payload=payload,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/safety-zones/{zone_id}", response_model=SafetyZoneItem)
def update_safety_zone_for_guardian(
    zone_id: str,
    payload: SafetyZoneUpdateRequest,
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    try:
        return update_safety_zone(
            db,
            elder_user_id=principal.elder_user_id,
            link_code=principal.link_code,
            zone_id=zone_id,
            payload=payload,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/safety-zones/{zone_id}", response_model=SafetyZoneDeleteResponse)
def delete_safety_zone_for_guardian(
    zone_id: str,
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    try:
        return delete_safety_zone(
            db,
            elder_user_id=principal.elder_user_id,
            link_code=principal.link_code,
            zone_id=zone_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/alerts/{alert_id}", response_model=AlertItem)
def update_guardian_alert(
    alert_id: str,
    payload: AlertStatusUpdateRequest,
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    try:
        return update_guardian_alert_for_guardian(
            db,
            elder_user_id=principal.elder_user_id,
            link_code=principal.link_code,
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
    limit: int = Query(30, ge=1, le=100),
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    try:
        return {
            "days": list_guardian_conversations(
                db,
                elder_user_id=principal.elder_user_id,
                link_code=principal.link_code,
                limit=limit,
            )
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/schedules", response_model=GuardianSchedulesResponse)
def read_guardian_schedules(
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    try:
        return {
            "items": list_guardian_schedules(
                db,
                elder_user_id=principal.elder_user_id,
                link_code=principal.link_code,
            )
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/schedules", response_model=GuardianScheduleItem)
def create_schedule_for_guardian(
    payload: GuardianScheduleCreateRequest,
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    try:
        return create_guardian_schedule(
            db,
            elder_user_id=principal.elder_user_id,
            link_code=principal.link_code,
            payload=payload,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/schedules/{schedule_id}", response_model=GuardianScheduleItem)
def update_schedule_for_guardian(
    schedule_id: str,
    payload: GuardianScheduleUpdateRequest,
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    try:
        return update_guardian_schedule(
            db,
            elder_user_id=principal.elder_user_id,
            link_code=principal.link_code,
            schedule_id=schedule_id,
            payload=payload,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/schedules/{schedule_id}", response_model=GuardianScheduleDeleteResponse)
def delete_schedule_for_guardian(
    schedule_id: str,
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    try:
        return delete_guardian_schedule(
            db,
            elder_user_id=principal.elder_user_id,
            link_code=principal.link_code,
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
def explain_health_metric(
    payload: HealthExplainRequest,
    _principal: GuardianPrincipal = Depends(get_current_guardian),
):
    explanation = generate_health_explanation(
        metric=payload.metric,
        items=[item.model_dump() for item in payload.items],
        elder_name=payload.elder_name,
    )
    return {"explanation": explanation}
