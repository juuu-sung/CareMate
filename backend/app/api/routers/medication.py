from fastapi import APIRouter

router = APIRouter()


@router.get("")
def list_medications() -> dict[str, list[dict[str, str]]]:
    return {
        "items": [
            {"name": "혈압약", "time": "08:00", "status": "scheduled"},
        ]
    }
