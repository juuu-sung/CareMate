"""add elder bearer sessions

Revision ID: 0015_elder_sessions
Revises: 0014_guardian_password
Create Date: 2026-09-14 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0015_elder_sessions"
down_revision: Union[str, None] = "0014_guardian_password"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "elder_sessions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("elder_user_id", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["elder_user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_elder_sessions_id", "elder_sessions", ["id"])
    op.create_index(
        "ix_elder_sessions_token_hash",
        "elder_sessions",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        "ix_elder_sessions_elder_user_id",
        "elder_sessions",
        ["elder_user_id"],
    )
    op.create_index(
        "ix_elder_sessions_expires_at",
        "elder_sessions",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_elder_sessions_expires_at", table_name="elder_sessions")
    op.drop_index("ix_elder_sessions_elder_user_id", table_name="elder_sessions")
    op.drop_index("ix_elder_sessions_token_hash", table_name="elder_sessions")
    op.drop_index("ix_elder_sessions_id", table_name="elder_sessions")
    op.drop_table("elder_sessions")
