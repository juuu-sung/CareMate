"""add safety zone address

Revision ID: 0010_safety_zone_address
Revises: 0009_safety_zones
Create Date: 2026-05-14
"""

from alembic import op


revision = "0010_safety_zone_address"
down_revision = "0009_safety_zones"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE safety_zones
        ADD COLUMN IF NOT EXISTS address VARCHAR(255) NOT NULL DEFAULT '';
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE safety_zones
        DROP COLUMN IF EXISTS address;
        """
    )
