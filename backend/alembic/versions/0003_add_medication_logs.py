"""add medication logs

Revision ID: 0003_add_medication_logs
Revises: 0002_add_agent_sessions
Create Date: 2026-04-14 00:00:00
"""

from alembic import op


revision = "0003_add_medication_logs"
down_revision = "0002_add_agent_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE medication_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            senior_user_id VARCHAR NOT NULL REFERENCES users(id),
            medication_name VARCHAR(120) NOT NULL,
            time_scope VARCHAR(40),
            status VARCHAR(20) NOT NULL DEFAULT 'taken',
            source VARCHAR(20) NOT NULL DEFAULT 'agent',
            recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX idx_medication_logs_senior_user_id_recorded_at
        ON medication_logs(senior_user_id, recorded_at DESC);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS medication_logs;
        """
    )
