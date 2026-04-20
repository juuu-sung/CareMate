from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.location import (
    LocationRequestPayload,
    LocationRequestStatusResponse,
    LocationSyncRequest,
    LocationSyncResponse,
)
from app.services.location_service import (
    get_location_request_status,
    record_location,
    request_location_refresh,
)

router = APIRouter(prefix="/locations", tags=["locations"])


@router.post("", response_model=LocationSyncResponse)
def create_location(payload: LocationSyncRequest, db: Session = Depends(get_db)):
    try:
        return record_location(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/request", response_model=LocationRequestStatusResponse)
def create_location_request(payload: LocationRequestPayload, db: Session = Depends(get_db)):
    try:
        return request_location_refresh(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/request", response_model=LocationRequestStatusResponse)
def read_location_request_status(
    elder_user_id: str = Query(...),
    link_code: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return get_location_request_status(
            db,
            LocationRequestPayload(
                elder_user_id=elder_user_id,
                link_code=link_code,
            ),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
