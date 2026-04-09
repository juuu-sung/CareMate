from fastapi import APIRouter

from app.api.routers.parent import router as parent_router
from app.api.routers.guardian import router as guardian_router
from app.api.routers.letter import router as letter_router

api_router = APIRouter()
api_router.include_router(parent_router)
api_router.include_router(guardian_router)
api_router.include_router(letter_router)
