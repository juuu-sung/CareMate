from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.guardians import GuardianDashboardResponse
from app.services.guardian_service import get_guardian_dashboard

router = APIRouter()


@router.get("/dashboard", response_model=GuardianDashboardResponse)
def guardian_dashboard(db: Session = Depends(get_db)) -> GuardianDashboardResponse:
    return get_guardian_dashboard(db)
