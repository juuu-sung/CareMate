from fastapi import APIRouter

from app.api.routers import alerts, chat, guardians, health, location, medication, modes, schedule

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(medication.router, prefix="/medications", tags=["medications"])
api_router.include_router(schedule.router, prefix="/schedules", tags=["schedules"])
api_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
api_router.include_router(location.router, prefix="/location", tags=["location"])
api_router.include_router(modes.router, prefix="/modes", tags=["modes"])
api_router.include_router(guardians.router, prefix="/guardians", tags=["guardians"])
