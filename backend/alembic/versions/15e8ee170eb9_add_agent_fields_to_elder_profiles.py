"""add agent fields to elder_profiles

Revision ID: 0004_add_agent_fields_to_elder_profiles
Revises: 0003_add_medication_logs
Create Date: 2026-04-19 00:00:00
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_agent_fields"
down_revision = "0003_add_medication_logs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("elder_profiles", sa.Column("agent_voice", sa.String(), nullable=True))
    op.add_column("elder_profiles", sa.Column("agent_name", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("elder_profiles", "agent_name")
    op.drop_column("elder_profiles", "agent_voice")