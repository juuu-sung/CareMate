from fastapi import APIRouter

from app.schemas.location import LatestLocationResponse, LocationUpdateRequest
from app.services.location_service import get_latest_location, update_location

router = APIRouter()


@router.post("", response_model=LatestLocationResponse)
def post_location(payload: LocationUpdateRequest) -> LatestLocationResponse:
    return update_location(payload)


@router.get("/latest", response_model=LatestLocationResponse)
def latest_location() -> LatestLocationResponse:
    return get_latest_location()
