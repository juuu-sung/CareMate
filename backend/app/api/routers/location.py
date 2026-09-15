from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import (
    CarePrincipal,
    get_current_care_principal,
    get_current_elder,
    get_current_guardian,
    get_db,
)
from app.schemas.location import (
    LocationRequestStatusResponse,
    LocationSyncRequest,
    LocationSyncResponse,
)
from app.services.location_service import (
    get_location_request_status,
    record_location,
    request_location_refresh,
)
from app.services.guardian_auth_service import GuardianPrincipal
from app.services.elder_auth_service import ElderPrincipal

router = APIRouter(prefix="/locations", tags=["locations"])


@router.post("", response_model=LocationSyncResponse)
def create_location(
    payload: LocationSyncRequest,
    principal: ElderPrincipal = Depends(get_current_elder),
    db: Session = Depends(get_db),
):
    try:
        return record_location(db, payload, elder_user_id=principal.elder_user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/request", response_model=LocationRequestStatusResponse)
def create_location_request(
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    try:
        return request_location_refresh(
            db,
            elder_user_id=principal.elder_user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/request", response_model=LocationRequestStatusResponse)
def read_location_request_status(
    principal: CarePrincipal = Depends(get_current_care_principal),
    db: Session = Depends(get_db),
):
    try:
        return get_location_request_status(
            db,
            elder_user_id=principal.elder_user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
