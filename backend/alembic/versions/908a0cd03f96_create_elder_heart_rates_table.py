"""create elder heart rates table

Revision ID: 908a0cd03f96
Revises: 0010_safety_zone_address
Create Date: 2026-05-19 15:21:21.456176

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '908a0cd03f96'
down_revision: Union[str, Sequence[str], None] = '0010_safety_zone_address'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table(
        "elder_heart_rates",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("elder_user_id", sa.String(), nullable=False),
        sa.Column("heart_rate", sa.Float(), nullable=False),
        sa.Column("measured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_elder_heart_rates_elder_user_id",
        "elder_heart_rates",
        ["elder_user_id"],
    )

    op.create_index(
        "ix_elder_heart_rates_measured_at",
        "elder_heart_rates",
        ["measured_at"],
    )

    op.create_index(
        "idx_elder_heart_rates_user_measured_at",
        "elder_heart_rates",
        ["elder_user_id", "measured_at"],
    )


def downgrade():
    op.drop_index("idx_elder_heart_rates_user_measured_at", table_name="elder_heart_rates")
    op.drop_index("ix_elder_heart_rates_measured_at", table_name="elder_heart_rates")
    op.drop_index("ix_elder_heart_rates_elder_user_id", table_name="elder_heart_rates")
    op.drop_table("elder_heart_rates")