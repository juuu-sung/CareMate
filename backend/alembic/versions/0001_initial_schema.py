"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-03-25 00:00:00
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE users (
            id UUID PRIMARY KEY,
            role VARCHAR(20) NOT NULL CHECK (role IN ('senior', 'guardian')),
            name VARCHAR(100) NOT NULL,
            phone VARCHAR(30),
            birth_date DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE guardian_links (
            id UUID PRIMARY KEY,
            senior_user_id UUID NOT NULL REFERENCES users(id),
            guardian_user_id UUID NOT NULL REFERENCES users(id),
            relationship_label VARCHAR(50),
            is_primary BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE care_profiles (
            id UUID PRIMARY KEY,
            senior_user_id UUID NOT NULL UNIQUE REFERENCES users(id),
            mode VARCHAR(30) NOT NULL CHECK (mode IN ('basic', 'cognitive_support', 'health_support')),
            check_in_interval_minutes INTEGER NOT NULL DEFAULT 180,
            alert_repeat_count INTEGER NOT NULL DEFAULT 3,
            always_on_location_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE medications (
            id UUID PRIMARY KEY,
            senior_user_id UUID NOT NULL REFERENCES users(id),
            name VARCHAR(120) NOT NULL,
            dosage_note VARCHAR(120),
            scheduled_time TIME NOT NULL,
            repeat_daily BOOLEAN NOT NULL DEFAULT TRUE,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE schedules (
            id UUID PRIMARY KEY,
            senior_user_id UUID NOT NULL REFERENCES users(id),
            title VARCHAR(150) NOT NULL,
            description TEXT,
            scheduled_at TIMESTAMPTZ NOT NULL,
            type VARCHAR(30) NOT NULL DEFAULT 'general',
            status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE check_ins (
            id UUID PRIMARY KEY,
            senior_user_id UUID NOT NULL REFERENCES users(id),
            requested_at TIMESTAMPTZ NOT NULL,
            responded_at TIMESTAMPTZ,
            status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'responded', 'missed')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE alerts (
            id UUID PRIMARY KEY,
            senior_user_id UUID NOT NULL REFERENCES users(id),
            type VARCHAR(50) NOT NULL,
            severity VARCHAR(20) NOT NULL DEFAULT 'medium',
            message TEXT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'open',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE locations (
            id UUID PRIMARY KEY,
            senior_user_id UUID NOT NULL REFERENCES users(id),
            latitude DOUBLE PRECISION NOT NULL,
            longitude DOUBLE PRECISION NOT NULL,
            source VARCHAR(30) NOT NULL DEFAULT 'mobile',
            captured_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE chat_logs (
            id UUID PRIMARY KEY,
            senior_user_id UUID NOT NULL REFERENCES users(id),
            role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
            content TEXT NOT NULL,
            mode VARCHAR(30) NOT NULL DEFAULT 'basic',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX idx_guardian_links_senior_user_id ON guardian_links(senior_user_id);
        CREATE INDEX idx_guardian_links_guardian_user_id ON guardian_links(guardian_user_id);
        CREATE INDEX idx_medications_senior_user_id ON medications(senior_user_id);
        CREATE INDEX idx_schedules_senior_user_id_scheduled_at ON schedules(senior_user_id, scheduled_at);
        CREATE INDEX idx_check_ins_senior_user_id_requested_at ON check_ins(senior_user_id, requested_at DESC);
        CREATE INDEX idx_alerts_senior_user_id_created_at ON alerts(senior_user_id, created_at DESC);
        CREATE INDEX idx_locations_senior_user_id_captured_at ON locations(senior_user_id, captured_at DESC);
        CREATE INDEX idx_chat_logs_senior_user_id_created_at ON chat_logs(senior_user_id, created_at DESC);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS chat_logs;
        DROP TABLE IF EXISTS locations;
        DROP TABLE IF EXISTS alerts;
        DROP TABLE IF EXISTS check_ins;
        DROP TABLE IF EXISTS schedules;
        DROP TABLE IF EXISTS medications;
        DROP TABLE IF EXISTS care_profiles;
        DROP TABLE IF EXISTS guardian_links;
        DROP TABLE IF EXISTS users;
        """
    )
