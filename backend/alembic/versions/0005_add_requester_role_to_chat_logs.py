"""add requester role to chat logs

Revision ID: 0005_chat_log_role
Revises: 0004_agent_fields
Create Date: 2026-04-21
"""

from alembic import op


revision = "0005_chat_log_role"
down_revision = "0004_agent_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE chat_logs
        ADD COLUMN requester_role VARCHAR(20) NOT NULL DEFAULT 'parent'
        CHECK (requester_role IN ('parent', 'guardian'));

        CREATE INDEX idx_chat_logs_senior_user_id_requester_role_created_at
        ON chat_logs(senior_user_id, requester_role, created_at DESC);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS idx_chat_logs_senior_user_id_requester_role_created_at;
        ALTER TABLE chat_logs
        DROP COLUMN IF EXISTS requester_role;
        """
    )
