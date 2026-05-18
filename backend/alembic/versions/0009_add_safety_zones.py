"""add safety zones

Revision ID: 0009_safety_zones
Revises: 0008_medication_easy_name
Create Date: 2026-05-07
"""

from alembic import op


revision = "0009_safety_zones"
down_revision = "0008_medication_easy_name"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE safety_zones (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            senior_user_id VARCHAR NOT NULL REFERENCES users(id),
            label VARCHAR(80) NOT NULL DEFAULT '안전구역',
            center_latitude DOUBLE PRECISION NOT NULL,
            center_longitude DOUBLE PRECISION NOT NULL,
            radius_meters INTEGER NOT NULL DEFAULT 300,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            last_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
            last_checked_at TIMESTAMPTZ,
            last_exit_alert_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT safety_zones_radius_check CHECK (radius_meters BETWEEN 50 AND 5000),
            CONSTRAINT safety_zones_status_check CHECK (last_status IN ('unknown', 'inside', 'outside'))
        );

        CREATE INDEX idx_safety_zones_senior_user_id
            ON safety_zones(senior_user_id);
        CREATE INDEX idx_safety_zones_senior_enabled
            ON safety_zones(senior_user_id, enabled);
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS safety_zones;")
