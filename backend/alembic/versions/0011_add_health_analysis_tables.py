"""add health analysis tables

Revision ID: 0011_health_analysis
Revises: 908a0cd03f96
Create Date: 2026-06-09 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_health_analysis"
down_revision: Union[str, None] = "908a0cd03f96"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- voice_utterances ----
    op.create_table(
        "voice_utterances",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("elder_user_id", sa.String(), nullable=False),
        sa.Column("transcript", sa.Text(), nullable=True),
        sa.Column("audio_duration_sec", sa.Float(), nullable=True),
        sa.Column("audio_format", sa.String(16), nullable=True),
        sa.Column("session_id", sa.String(), nullable=True),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("text_batch_id", sa.String(), nullable=True),
        sa.Column("text_analyzed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "idx_voice_utterances_elder_recorded",
        "voice_utterances",
        ["elder_user_id", sa.text("recorded_at DESC")],
    )
    op.create_index(
        "idx_voice_utterances_not_analyzed",
        "voice_utterances",
        ["elder_user_id", "text_analyzed_at"],
    )

    # ---- voice_health_analyses ----
    op.create_table(
        "voice_health_analyses",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "utterance_id",
            sa.String(),
            sa.ForeignKey("voice_utterances.id"),
            nullable=False,
        ),
        sa.Column("elder_user_id", sa.String(), nullable=False),
        sa.Column("cognitive_wav_probability", sa.Float(), nullable=True),
        sa.Column("cognitive_wav_prediction", sa.Integer(), nullable=True),
        sa.Column(
            "cognitive_wav_status",
            sa.String(16),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("cognitive_wav_error", sa.Text(), nullable=True),
        sa.Column("depression_wav_probability", sa.Float(), nullable=True),
        sa.Column("depression_wav_prediction", sa.Integer(), nullable=True),
        sa.Column(
            "depression_wav_status",
            sa.String(16),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("depression_wav_error", sa.Text(), nullable=True),
        sa.Column("insomnia_wav_probability", sa.Float(), nullable=True),
        sa.Column("insomnia_wav_prediction", sa.Integer(), nullable=True),
        sa.Column(
            "insomnia_wav_status",
            sa.String(16),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("insomnia_wav_error", sa.Text(), nullable=True),
        sa.Column(
            "model_version",
            sa.String(64),
            nullable=True,
            server_default="wav_v1",
        ),
        sa.Column("analyzed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_voice_health_analyses_utterance",
        "voice_health_analyses",
        ["utterance_id"],
    )
    op.create_index(
        "idx_voice_health_analyses_elder_created",
        "voice_health_analyses",
        ["elder_user_id", sa.text("created_at DESC")],
    )

    # ---- daily_health_analyses ----
    op.create_table(
        "daily_health_analyses",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("elder_user_id", sa.String(), nullable=False),
        sa.Column("analysis_date", sa.Date(), nullable=False),
        sa.Column("cognitive_wav_score", sa.Float(), nullable=True),
        sa.Column("depression_daily_score", sa.Float(), nullable=True),
        sa.Column("insomnia_daily_score", sa.Float(), nullable=True),
        sa.Column("cognitive_text_score", sa.Float(), nullable=True),
        sa.Column("cognitive_daily_score", sa.Float(), nullable=True),
        sa.Column(
            "utterance_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "text_analysis_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "elder_user_id",
            "analysis_date",
            name="uq_daily_health_elder_date",
        ),
    )
    op.create_index(
        "idx_daily_health_elder_date",
        "daily_health_analyses",
        ["elder_user_id", sa.text("analysis_date DESC")],
    )


def downgrade() -> None:
    op.drop_table("daily_health_analyses")
    op.drop_table("voice_health_analyses")
    op.drop_table("voice_utterances")
