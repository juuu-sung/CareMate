"""add medication easy name

Revision ID: 0008_medication_easy_name
Revises: 0007_push_tokens
Create Date: 2026-05-05
"""

from alembic import op


revision = "0008_medication_easy_name"
down_revision = "0007_push_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE medications
        ADD COLUMN IF NOT EXISTS easy_name VARCHAR(80);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE medications
        DROP COLUMN IF EXISTS easy_name;
        """
    )
