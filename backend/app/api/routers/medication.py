from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.medication import MedicationListResponse
from app.services.medication_service import list_medication_items

router = APIRouter()


@router.get("")
def list_medications(
    elder_user_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> MedicationListResponse:
    return MedicationListResponse(items=list_medication_items(db, elder_user_id=elder_user_id))
