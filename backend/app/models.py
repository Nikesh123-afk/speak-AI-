import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, SmallInteger, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    type_annotation_map = {datetime: TIMESTAMP(timezone=True), uuid.UUID: UUID(as_uuid=True), dict[str, Any]: JSONB}


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("length(name) BETWEEN 1 AND 100", name="users_name_length"),
        CheckConstraint("plan IN ('free','standard','premium')", name="users_plan"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text, unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    plan: Mapped[str] = mapped_column(Text, server_default="free")
    stripe_customer_id: Mapped[str | None] = mapped_column(Text, unique=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(Text, unique=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class AuthSession(Base):
    __tablename__ = "sessions"
    __table_args__ = (Index("sessions_expiration", "expires_at"), Index("sessions_user", "user_id"))
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Practice(Base):
    __tablename__ = "practices"
    __table_args__ = (
        UniqueConstraint("user_id", "request_key", name="practices_request_key"),
        CheckConstraint("part BETWEEN 1 AND 3", name="practices_part"),
        CheckConstraint("status IN ('pending','complete','failed')", name="practices_status"),
        CheckConstraint("(kind = 'practice' AND part IS NOT NULL) OR (kind = 'mock' AND part IS NULL)", name="practices_kind"),
        Index("practices_history", "user_id", "created_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    request_key: Mapped[uuid.UUID]
    topic: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(Text, server_default="practice")
    part: Mapped[int | None] = mapped_column(SmallInteger)
    answers: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    feedback: Mapped[dict[str, Any] | None]
    status: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Subscriber(Base):
    __tablename__ = "subscribers"
    email: Mapped[str] = mapped_column(Text, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class RateLimit(Base):
    __tablename__ = "rate_limits"
    __table_args__ = (Index("rate_limits_expiration", "expires_at"),)
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    count: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime]


class StripeEvent(Base):
    __tablename__ = "stripe_events"
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    processed_at: Mapped[datetime] = mapped_column(server_default=func.now())
