from app.schemas.location import LatestLocationResponse, LocationUpdateRequest

_latest_location = LatestLocationResponse(
    latitude=37.5665,
    longitude=126.9780,
    captured_at="2026-03-24T10:20:00+09:00",
    source="seed",
)


def update_location(payload: LocationUpdateRequest) -> LatestLocationResponse:
    global _latest_location
    _latest_location = LatestLocationResponse(
        latitude=payload.latitude,
        longitude=payload.longitude,
        captured_at="2026-03-24T10:20:00+09:00",
        source=payload.source,
    )
    return _latest_location


def get_latest_location() -> LatestLocationResponse:
    return _latest_location
