"""add guardian bearer sessions

Revision ID: 0013_guardian_sessions
Revises: 0012_cognitive_text
Create Date: 2026-09-10 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0013_guardian_sessions"
down_revision: Union[str, None] = "0012_cognitive_text"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "guardian_sessions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("guardian_user_id", sa.String(), nullable=False),
        sa.Column("guardian_link_id", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["guardian_link_id"],
            ["guardian_links.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["guardian_user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_guardian_sessions_id", "guardian_sessions", ["id"])
    op.create_index("ix_guardian_sessions_token_hash", "guardian_sessions", ["token_hash"], unique=True)
    op.create_index("ix_guardian_sessions_guardian_user_id", "guardian_sessions", ["guardian_user_id"])
    op.create_index("ix_guardian_sessions_guardian_link_id", "guardian_sessions", ["guardian_link_id"])
    op.create_index("ix_guardian_sessions_expires_at", "guardian_sessions", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_guardian_sessions_expires_at", table_name="guardian_sessions")
    op.drop_index("ix_guardian_sessions_guardian_link_id", table_name="guardian_sessions")
    op.drop_index("ix_guardian_sessions_guardian_user_id", table_name="guardian_sessions")
    op.drop_index("ix_guardian_sessions_token_hash", table_name="guardian_sessions")
    op.drop_index("ix_guardian_sessions_id", table_name="guardian_sessions")
    op.drop_table("guardian_sessions")
