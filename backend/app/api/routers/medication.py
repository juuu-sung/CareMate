from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.medication import (
    MedicationAnalyticsResponse,
    MedicationListResponse,
    MedicationRecordRequest,
    MedicationRecordResponse,
)
from app.services.medication_service import (
    get_medication_analytics,
    list_medication_items,
    record_medication_status,
)

router = APIRouter()


@router.get("")
def list_medications(
    elder_user_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> MedicationListResponse:
    return MedicationListResponse(items=list_medication_items(db, elder_user_id=elder_user_id))


@router.get("/analytics")
def medication_analytics(
    elder_user_id: str | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=31),
    db: Session = Depends(get_db),
) -> MedicationAnalyticsResponse:
    return get_medication_analytics(db, elder_user_id=elder_user_id, days=days)


@router.post("/record")
def record_medication(
    payload: MedicationRecordRequest,
    db: Session = Depends(get_db),
) -> MedicationRecordResponse:
    return MedicationRecordResponse(
        **record_medication_status(
            db,
            elder_user_id=payload.elder_user_id,
            medication_id=payload.medication_id,
            medication_name=payload.medication_name,
            time_scope=payload.time_scope,
            status=payload.status,
            source="mobile",
        )
    )
