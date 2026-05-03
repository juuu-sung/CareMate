from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.medication import (
    MedicationListResponse,
    MedicationRecordRequest,
    MedicationRecordResponse,
)
from app.services.medication_service import (
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
