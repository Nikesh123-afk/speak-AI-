import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from .config import Settings
from .errors import AppError
from .models import AuthSession

SESSION_COOKIE = "ielts_session"
_hasher = PasswordHasher()  # argon2id with library defaults (64 MiB, t=3)
# Verified against when the account does not exist, so response time does not reveal registered emails.
_dummy_hash = _hasher.hash(secrets.token_hex(16))


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


async def hash_password(password: str) -> str:
    return await run_in_threadpool(_hasher.hash, password)


async def verify_password(password: str, encoded: str | None) -> bool:
    try:
        return await run_in_threadpool(_hasher.verify, encoded or _dummy_hash, password) and encoded is not None
    except (VerificationError, InvalidHashError):
        return False


def valid_token(token: str | None) -> bool:
    return bool(token) and len(token) == 64 and all(c in "0123456789abcdef" for c in token)


async def create_session(db: AsyncSession, response: Response, user_id: uuid.UUID, settings: Settings) -> None:
    token = secrets.token_hex(32)
    db.add(AuthSession(token_hash=digest(token), user_id=user_id, expires_at=datetime.now(UTC) + timedelta(days=settings.session_days)))
    response.set_cookie(SESSION_COOKIE, token, max_age=settings.session_days * 86400, httponly=True,
                        secure=settings.production, samesite="lax", path="/")


async def rate_limit(db: AsyncSession, key: str, limit: int, seconds: int) -> None:
    """Fixed-window counter stored in PostgreSQL so limits hold across every app instance."""
    count = (await db.execute(text("""
        INSERT INTO rate_limits(key, count, expires_at) VALUES (:key, 1, now() + make_interval(secs => :seconds))
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN rate_limits.expires_at < now() THEN 1 ELSE rate_limits.count + 1 END,
          expires_at = CASE WHEN rate_limits.expires_at < now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END
        RETURNING count"""), {"key": digest(key), "seconds": seconds})).scalar_one()
    # Commit immediately so the attempt counts even if the request later fails.
    await db.commit()
    if count > limit:
        raise AppError(429, "Too many requests. Please try again later.")
