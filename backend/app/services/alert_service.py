from app.schemas.alerts import AlertItem


def list_alerts() -> list[AlertItem]:
    return [
        AlertItem(
            type="medication_missed",
            message="복약 알림 3회 미응답",
            created_at="2026-03-24T09:30:00+09:00",
        )
    ]
