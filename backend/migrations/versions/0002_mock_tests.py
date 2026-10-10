"""full mock tests

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A mock test spans Parts 1-3, so it has no single part; each answer records its own.
    op.add_column("practices", sa.Column("kind", sa.Text, nullable=False, server_default="practice"))
    op.alter_column("practices", "part", nullable=True)
    op.create_check_constraint("practices_kind", "practices",
                               "(kind = 'practice' AND part IS NOT NULL) OR (kind = 'mock' AND part IS NULL)")


def downgrade() -> None:
    op.execute("DELETE FROM practices WHERE kind = 'mock'")
    op.drop_constraint("practices_kind", "practices")
    op.alter_column("practices", "part", nullable=False)
    op.drop_column("practices", "kind")
