"""add care documents and expand elder profile text

Revision ID: 0006_care_documents
Revises: 0005_chat_log_role
Create Date: 2026-04-25
"""

from alembic import op


revision = "0006_care_documents"
down_revision = "0005_chat_log_role"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE care_documents (
            id VARCHAR PRIMARY KEY,
            elder_user_id VARCHAR NOT NULL REFERENCES users(id),
            document_type VARCHAR NOT NULL,
            image_path VARCHAR NOT NULL,
            summary TEXT DEFAULT '',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX idx_care_documents_elder_user_id
        ON care_documents(elder_user_id);

        ALTER TABLE elder_profiles
        ALTER COLUMN medications TYPE TEXT;

        ALTER TABLE elder_profiles
        ALTER COLUMN diseases TYPE TEXT;

        ALTER TABLE elder_profiles
        ALTER COLUMN allergies TYPE TEXT;

        ALTER TABLE elder_profiles
        ALTER COLUMN memo TYPE TEXT;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE elder_profiles
        ALTER COLUMN memo TYPE VARCHAR;

        ALTER TABLE elder_profiles
        ALTER COLUMN allergies TYPE VARCHAR;

        ALTER TABLE elder_profiles
        ALTER COLUMN diseases TYPE VARCHAR;

        ALTER TABLE elder_profiles
        ALTER COLUMN medications TYPE VARCHAR;

        DROP INDEX IF EXISTS idx_care_documents_elder_user_id;

        DROP TABLE IF EXISTS care_documents;
        """
    )