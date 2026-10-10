"""initial schema

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

tz = TIMESTAMP(timezone=True)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("email", sa.Text, nullable=False, unique=True),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column("plan", sa.Text, nullable=False, server_default="free"),
        sa.Column("stripe_customer_id", sa.Text, unique=True),
        sa.Column("stripe_subscription_id", sa.Text, unique=True),
        sa.Column("created_at", tz, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("length(name) BETWEEN 1 AND 100", name="users_name_length"),
        sa.CheckConstraint("plan IN ('free','standard','premium')", name="users_plan"),
    )
    op.create_table(
        "sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", tz, nullable=False),
        sa.Column("created_at", tz, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("sessions_expiration", "sessions", ["expires_at"])
    op.create_index("sessions_user", "sessions", ["user_id"])
    op.create_table(
        "practices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_key", UUID(as_uuid=True), nullable=False),
        sa.Column("topic", sa.Text, nullable=False),
        sa.Column("part", sa.SmallInteger, nullable=False),
        sa.Column("answers", JSONB, nullable=False),
        sa.Column("feedback", JSONB),
        sa.Column("status", sa.Text, nullable=False),
        sa.Column("created_at", tz, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "request_key", name="practices_request_key"),
        sa.CheckConstraint("part BETWEEN 1 AND 3", name="practices_part"),
        sa.CheckConstraint("status IN ('pending','complete','failed')", name="practices_status"),
    )
    op.create_index("practices_history", "practices", ["user_id", "created_at"])
    op.create_table(
        "subscribers",
        sa.Column("email", sa.Text, primary_key=True),
        sa.Column("created_at", tz, nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "rate_limits",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("count", sa.Integer, nullable=False),
        sa.Column("expires_at", tz, nullable=False),
    )
    op.create_index("rate_limits_expiration", "rate_limits", ["expires_at"])
    op.create_table(
        "stripe_events",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("processed_at", tz, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    for table in ("stripe_events", "rate_limits", "subscribers", "practices", "sessions", "users"):
        op.drop_table(table)
