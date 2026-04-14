from sqlalchemy import text
from sqlalchemy.orm import Session


def append_chat_log(db: Session, role: str, content: str, mode: str) -> None:
    normalized_content = content.strip()
    if not normalized_content:
        return

    senior_user_id = _get_primary_elder_id(db)
    if not senior_user_id:
        return

    db.execute(
        text(
            """
            INSERT INTO chat_logs (
                senior_user_id,
                role,
                content,
                mode
            )
            VALUES (
                :senior_user_id,
                :role,
                :content,
                :mode
            )
            """
        ),
        {
            "senior_user_id": senior_user_id,
            "role": role,
            "content": normalized_content,
            "mode": mode,
        },
    )
    db.commit()


def list_chat_logs(db: Session, limit: int = 50) -> list[dict[str, str]]:
    senior_user_id = _get_primary_elder_id(db)
    if not senior_user_id:
        return []

    rows = db.execute(
        text(
            """
            SELECT role, content, mode, created_at
            FROM chat_logs
            WHERE senior_user_id = :senior_user_id
            ORDER BY created_at DESC
            LIMIT :limit
            """
        ),
        {
            "senior_user_id": senior_user_id,
            "limit": limit,
        },
    ).mappings().all()

    return [
        {
            "role": row["role"],
            "content": row["content"],
            "mode": row["mode"],
            "created_at": row["created_at"].isoformat(),
        }
        for row in reversed(rows)
    ]


def _get_primary_elder_id(db: Session) -> str | None:
    row = db.execute(
        text(
            """
            SELECT id
            FROM users
            WHERE role = 'elder'
            ORDER BY created_at ASC
            LIMIT 1
            """
        )
    ).mappings().first()
    return row["id"] if row else None
