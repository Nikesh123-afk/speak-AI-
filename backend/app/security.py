import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Request, Response
from sqlalchemy import delete, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from .config import Settings
from .errors import AppError
from .models import AuthSession, EmailToken

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


def client_ip(request: Request) -> str:
    # `client` is None for some ASGI servers and transports; share one bucket rather than crash.
    return request.client.host if request.client else "unknown"


def sign(settings: Settings, purpose: str, value: str) -> str:
    """Stateless signature for links that must keep working, such as newsletter unsubscribe."""
    return hmac.new(settings.secret_key.encode(), f"{purpose}:{value}".encode(), hashlib.sha256).hexdigest()


def signature_ok(settings: Settings, purpose: str, value: str, signature: str) -> bool:
    return hmac.compare_digest(sign(settings, purpose, value), signature)


def valid_token(token: str | None) -> bool:
    return bool(token) and len(token) == 64 and all(c in "0123456789abcdef" for c in token)


async def create_session(db: AsyncSession, response: Response, user_id: uuid.UUID, settings: Settings) -> None:
    token = secrets.token_hex(32)
    db.add(AuthSession(token_hash=digest(token), user_id=user_id, expires_at=datetime.now(UTC) + timedelta(days=settings.session_days)))
    response.set_cookie(SESSION_COOKIE, token, max_age=settings.session_days * 86400, httponly=True,
                        secure=settings.production, samesite="lax", path="/")


async def revoke_sessions(db: AsyncSession, user_id: uuid.UUID, keep_token: str | None = None) -> None:
    query = delete(AuthSession).where(AuthSession.user_id == user_id)
    if keep_token:
        query = query.where(AuthSession.token_hash != digest(keep_token))
    await db.execute(query)


def issue_email_token(db: AsyncSession, user_id: uuid.UUID, purpose: str, email: str, hours: int) -> str:
    token = secrets.token_hex(32)
    db.add(EmailToken(token_hash=digest(token), user_id=user_id, purpose=purpose, email=email,
                      expires_at=datetime.now(UTC) + timedelta(hours=hours)))
    return token


async def consume_email_token(db: AsyncSession, token: str, purpose: str) -> EmailToken | None:
    """Deletes and returns the token in one statement, so a link can only ever be used once."""
    if not valid_token(token):
        return None
    return (await db.execute(
        delete(EmailToken).where(EmailToken.token_hash == digest(token), EmailToken.purpose == purpose,
                                 EmailToken.expires_at > func.now()).returning(EmailToken)
    )).scalar_one_or_none()


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
