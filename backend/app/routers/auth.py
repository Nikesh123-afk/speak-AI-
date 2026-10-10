from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Request, Response
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert

from ..config import Settings
from ..deps import AppMailer, AppSettings, CurrentUser, Db, MaybeUser, user_out
from ..errors import AppError
from ..mail import Mailer, send_quietly
from ..models import AuthSession, EmailToken, User
from ..schemas import EmailIn, LoginIn, ResetIn, SignupIn, TokenIn, UserOut
from ..security import (SESSION_COOKIE, client_ip, consume_email_token, create_session, digest, hash_password,
                        issue_email_token, rate_limit, revoke_sessions, valid_token, verify_password)

router = APIRouter(prefix="/api/auth", tags=["auth"])
RESET_HOURS = 1
VERIFY_HOURS = 48


async def _drop_current_session(db: Db, request: Request) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if valid_token(token):
        await db.execute(delete(AuthSession).where(AuthSession.token_hash == digest(token)))


def queue_verification(db: Db, tasks: BackgroundTasks, mailer: Mailer, settings: Settings, user: User) -> None:
    """Issues a verification link for the user's current address. Sent after the response, once committed."""
    token = issue_email_token(db, user.id, "verify", user.email, VERIFY_HOURS)
    tasks.add_task(send_quietly, mailer, user.email, "Confirm your email for IELTS Fluent AI",
                   f"Hi {user.name},\n\nConfirm this is your email address:\n{settings.app_origin}/verify-email?token={token}\n\n"
                   f"The link works for {VERIFY_HOURS} hours. If you didn't create an account, ignore this email.")


@router.get("/me")
async def me(user: MaybeUser, settings: AppSettings) -> dict[str, UserOut | None]:
    return {"user": user_out(user, settings) if user else None}


@router.post("/signup", status_code=201)
async def signup(body: SignupIn, request: Request, response: Response, tasks: BackgroundTasks, db: Db,
                 settings: AppSettings, mailer: AppMailer) -> dict[str, UserOut]:
    await rate_limit(db, f"auth-ip:{client_ip(request)}", 20, 900)
    password_hash = await hash_password(body.password)
    user = (await db.execute(
        insert(User).values(name=body.name, email=body.email, password_hash=password_hash)
        .on_conflict_do_nothing(index_elements=["email"]).returning(User)
    )).scalar_one_or_none()
    if user is None:
        raise AppError(409, "An account with this email already exists.")
    # Rotate the session on every login so a planted cookie can never be upgraded.
    await _drop_current_session(db, request)
    await create_session(db, response, user.id, settings)
    queue_verification(db, tasks, mailer, settings, user)
    await db.commit()
    return {"user": user_out(user, settings)}


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response, db: Db, settings: AppSettings) -> dict[str, UserOut]:
    await rate_limit(db, f"auth-ip:{client_ip(request)}", 20, 900)
    await rate_limit(db, f"auth-account:{body.email}", 15, 900)
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not await verify_password(body.password, user.password_hash if user else None) or user is None:
        raise AppError(401, "Invalid email or password.")
    await _drop_current_session(db, request)
    await create_session(db, response, user.id, settings)
    await db.commit()
    return {"user": user_out(user, settings)}


@router.post("/logout")
async def logout(request: Request, response: Response, db: Db) -> dict[str, bool]:
    await _drop_current_session(db, request)
    await db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.post("/forgot-password")
async def forgot_password(body: EmailIn, request: Request, tasks: BackgroundTasks, db: Db, settings: AppSettings,
                          mailer: AppMailer) -> dict[str, str]:
    await rate_limit(db, f"forgot-ip:{client_ip(request)}", 10, 3600)
    await rate_limit(db, f"forgot-account:{body.email}", 3, 3600)
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if user:
        # One live reset link at a time.
        await db.execute(delete(EmailToken).where(EmailToken.user_id == user.id, EmailToken.purpose == "reset"))
        token = issue_email_token(db, user.id, "reset", user.email, RESET_HOURS)
        await db.commit()
        tasks.add_task(send_quietly, mailer, user.email, "Reset your IELTS Fluent AI password",
                       f"Hi {user.name},\n\nChoose a new password here:\n{settings.app_origin}/reset-password?token={token}\n\n"
                       f"The link works for {RESET_HOURS} hour and only once. If you didn't ask for this, ignore this email; "
                       "your password hasn't changed.")
    # Same answer either way, and the email is sent after responding, so neither reveals who has an account.
    return {"message": "If an account exists for that email, we've sent a link to reset the password."}


@router.post("/reset-password")
async def reset_password(body: ResetIn, request: Request, response: Response, db: Db, settings: AppSettings) -> dict[str, UserOut]:
    await rate_limit(db, f"reset-ip:{client_ip(request)}", 20, 3600)
    token = await consume_email_token(db, body.token, "reset")
    if token is None:
        raise AppError(400, "This reset link is invalid or has expired. Request a new one.")
    user = (await db.execute(select(User).where(User.id == token.user_id))).scalar_one()
    user.password_hash = await hash_password(body.password)
    # Receiving the email proves ownership of the address.
    if user.email == token.email and user.email_verified_at is None:
        user.email_verified_at = datetime.now(UTC)
    # Whoever knew the old password is signed out everywhere.
    await revoke_sessions(db, user.id)
    await create_session(db, response, user.id, settings)
    await db.commit()
    return {"user": user_out(user, settings)}


@router.post("/verify-email")
async def verify_email(body: TokenIn, request: Request, db: Db, settings: AppSettings) -> dict[str, UserOut]:
    await rate_limit(db, f"verify-ip:{client_ip(request)}", 30, 3600)
    token = await consume_email_token(db, body.token, "verify")
    if token is None:
        raise AppError(400, "This confirmation link is invalid or has expired.")
    user = (await db.execute(
        update(User).where(User.id == token.user_id, User.email == token.email)
        .values(email_verified_at=datetime.now(UTC)).returning(User)
    )).scalar_one_or_none()
    if user is None:
        raise AppError(400, "This link was for an email address that is no longer on the account.")
    await db.commit()
    return {"user": user_out(user, settings)}


@router.post("/resend-verification")
async def resend_verification(user: CurrentUser, tasks: BackgroundTasks, db: Db, settings: AppSettings,
                              mailer: AppMailer) -> dict[str, str]:
    await rate_limit(db, f"verify-send:{user.id}", 5, 3600)
    if user.email_verified_at is not None:
        return {"message": "Your email is already confirmed."}
    await db.execute(delete(EmailToken).where(EmailToken.user_id == user.id, EmailToken.purpose == "verify"))
    queue_verification(db, tasks, mailer, settings, user)
    await db.commit()
    return {"message": f"We've sent a new confirmation link to {user.email}."}
