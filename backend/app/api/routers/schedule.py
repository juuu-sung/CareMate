from fastapi import APIRouter

router = APIRouter()


@router.get("")
def list_schedules() -> dict[str, list[dict[str, str]]]:
    return {
        "items": [
            {"title": "주민센터 방문", "time": "15:00", "status": "scheduled"},
        ]
    }
