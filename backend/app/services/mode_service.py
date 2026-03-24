from app.schemas.modes import CareModeResponse, CareModeUpdateRequest, GuardianOptions

_current_mode = CareModeResponse(
    mode="basic",
    options=GuardianOptions(),
)


def get_current_mode() -> CareModeResponse:
    return _current_mode


def update_mode(payload: CareModeUpdateRequest) -> CareModeResponse:
    global _current_mode
    _current_mode = CareModeResponse(mode=payload.mode, options=payload.options)
    return _current_mode
