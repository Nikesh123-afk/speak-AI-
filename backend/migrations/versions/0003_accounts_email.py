"""email verification, password reset and newsletter double opt-in

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import TIMESTAMP, UUID

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

tz = TIMESTAMP(timezone=True)


def upgrade() -> None:
    op.add_column("users", sa.Column("email_verified_at", tz))
    op.add_column("subscribers", sa.Column("confirmed_at", tz))
    # Existing subscribers never proved they own their address, so they stay unconfirmed and receive nothing
    # until they subscribe again and confirm.
    op.create_table(
        "email_tokens",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purpose", sa.Text, nullable=False),
        sa.Column("email", sa.Text, nullable=False),
        sa.Column("expires_at", tz, nullable=False),
        sa.CheckConstraint("purpose IN ('reset','verify')", name="email_tokens_purpose"),
    )
    op.create_index("email_tokens_user", "email_tokens", ["user_id"])
    op.create_index("email_tokens_expiration", "email_tokens", ["expires_at"])


def downgrade() -> None:
    op.drop_table("email_tokens")
    op.drop_column("subscribers", "confirmed_at")
    op.drop_column("users", "email_verified_at")
