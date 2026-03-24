from fastapi import APIRouter

from app.schemas.guardians import GuardianDashboardResponse
from app.services.guardian_service import get_guardian_dashboard

router = APIRouter()


@router.get("/dashboard", response_model=GuardianDashboardResponse)
def guardian_dashboard() -> GuardianDashboardResponse:
    return get_guardian_dashboard()
