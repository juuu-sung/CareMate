"""add agent sessions

Revision ID: 0002_add_agent_sessions
Revises: 0001_initial_schema
Create Date: 2026-04-13 00:00:00
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0002_add_agent_sessions"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE agent_sessions (
            session_id VARCHAR PRIMARY KEY,
            mode VARCHAR(30) NOT NULL CHECK (mode IN ('basic', 'cognitive_support', 'health_support')),
            pending_action VARCHAR(50) NOT NULL,
            slots_json TEXT NOT NULL DEFAULT '{}',
            awaiting_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX idx_agent_sessions_updated_at ON agent_sessions(updated_at DESC);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS agent_sessions;
        """
    )
