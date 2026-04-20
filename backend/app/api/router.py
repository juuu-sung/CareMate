from fastapi import APIRouter

from app.api.routers.alerts import router as alerts_router
from app.api.routers.chat import router as chat_router
from app.api.routers.parent import router as parent_router
from app.api.routers.guardian import router as guardian_router
from app.api.routers.health import router as health_router
from app.api.routers.letter import router as letter_router
from app.api.routers.location import router as location_router
from app.api.routers.medication import router as medication_router
from app.api.routers.modes import router as modes_router
from app.api.routers.schedule import router as schedule_router
from app.api.routers.guardian_link import router as guardian_link_router
from app.api.routers.elder_profile import router as elder_profile_router


api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(chat_router, prefix="/chat", tags=["chat"])
api_router.include_router(modes_router, prefix="/modes", tags=["modes"])
api_router.include_router(schedule_router, prefix="/schedules", tags=["schedules"])
api_router.include_router(medication_router, prefix="/medications", tags=["medications"])
api_router.include_router(alerts_router, prefix="/alerts", tags=["alerts"])
api_router.include_router(parent_router)
api_router.include_router(guardian_router)
api_router.include_router(letter_router)
api_router.include_router(guardian_link_router)
api_router.include_router(location_router)
api_router.include_router(elder_profile_router)
