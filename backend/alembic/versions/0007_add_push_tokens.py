"""add push tokens

Revision ID: 0007_push_tokens
Revises: 0006_care_documents
Create Date: 2026-05-04 00:00:00
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "0007_push_tokens"
down_revision = "0006_care_documents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE push_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id VARCHAR REFERENCES users(id),
            user_role VARCHAR(20) NOT NULL CHECK (user_role IN ('elder', 'guardian')),
            elder_user_id VARCHAR NOT NULL REFERENCES users(id),
            link_code VARCHAR,
            expo_push_token TEXT NOT NULL UNIQUE,
            device_id VARCHAR(120) NOT NULL,
            platform VARCHAR(20) NOT NULL DEFAULT 'unknown',
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            last_registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX idx_push_tokens_elder_user_role
            ON push_tokens(elder_user_id, user_role, enabled);
        CREATE INDEX idx_push_tokens_user_id
            ON push_tokens(user_id);
        CREATE INDEX idx_push_tokens_device_id
            ON push_tokens(device_id);
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS push_tokens;")
