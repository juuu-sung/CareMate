"""add cognitive text columns to voice_health_analyses

Revision ID: 0012_cognitive_text
Revises: 0011_health_analysis
Create Date: 2026-06-11 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012_cognitive_text"
down_revision: Union[str, None] = "0011_health_analysis"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("voice_health_analyses", sa.Column("cognitive_text_probability", sa.Float(), nullable=True))
    op.add_column("voice_health_analyses", sa.Column("cognitive_text_prediction", sa.Integer(), nullable=True))
    op.add_column("voice_health_analyses", sa.Column("cognitive_text_status", sa.String(16), nullable=False, server_default="pending"))
    op.add_column("voice_health_analyses", sa.Column("cognitive_text_error", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("voice_health_analyses", "cognitive_text_error")
    op.drop_column("voice_health_analyses", "cognitive_text_status")
    op.drop_column("voice_health_analyses", "cognitive_text_prediction")
    op.drop_column("voice_health_analyses", "cognitive_text_probability")
