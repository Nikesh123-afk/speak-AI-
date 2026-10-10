import json
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from ..deps import AppMailer, AppSettings, CurrentUser, Db, user_out
from ..errors import AppError
from ..mail import send_quietly
from ..models import AuthSession, EmailToken, Practice, Subscriber, User
from ..schemas import EmailChangeIn, PasswordChangeIn, PasswordConfirmIn, PracticeOut, ProfileIn, UserOut
from ..security import SESSION_COOKIE, hash_password, rate_limit, revoke_sessions, verify_password
from .auth import queue_verification
from .billing import cancel_subscriptions

router = APIRouter(prefix="/api/account", tags=["account"])


async def _check_password(db: Db, user: User, password: str) -> None:
    await rate_limit(db, f"account-password:{user.id}", 10, 900)
    if not await verify_password(password, user.password_hash):
        raise AppError(400, "Your current password is incorrect.")


@router.get("/sessions")
async def sessions(user: CurrentUser, db: Db) -> dict[str, int]:
    count = (await db.execute(select(func.count()).select_from(AuthSession).where(
        AuthSession.user_id == user.id, AuthSession.expires_at > func.now()))).scalar_one()
    return {"active": count}


@router.patch("")
async def update_profile(body: ProfileIn, user: CurrentUser, db: Db, settings: AppSettings) -> dict[str, UserOut]:
    record = await db.get(User, user.id)
    record.name = body.name
    await db.commit()
    return {"user": user_out(record, settings)}


@router.post("/email")
async def change_email(body: EmailChangeIn, user: CurrentUser, tasks: BackgroundTasks, db: Db,
                       settings: AppSettings, mailer: AppMailer) -> dict[str, UserOut]:
    await _check_password(db, user, body.password)
    if body.email == user.email:
        raise AppError(400, "That is already your email address.")
    await db.execute(delete(EmailToken).where(EmailToken.user_id == user.id))
    record = await db.get(User, user.id)
    old_email = record.email
    record.email, record.email_verified_at = body.email, None
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise AppError(409, "An account with this email already exists.") from None
    queue_verification(db, tasks, mailer, settings, record)
    await db.commit()
    tasks.add_task(send_quietly, mailer, old_email, "Your IELTS Fluent AI email was changed",
                   f"Hi {record.name},\n\nThe email on your account was changed to {body.email}. "
                   f"If you didn't do this, reset your password at {settings.app_origin}/forgot-password "
                   "and contact support.")
    return {"user": user_out(record, settings)}


@router.post("/password")
async def change_password(body: PasswordChangeIn, request: Request, user: CurrentUser, tasks: BackgroundTasks,
                          db: Db, settings: AppSettings, mailer: AppMailer) -> dict[str, bool]:
    await _check_password(db, user, body.current_password)
    record = await db.get(User, user.id)
    record.password_hash = await hash_password(body.new_password)
    await revoke_sessions(db, user.id, keep_token=request.cookies.get(SESSION_COOKIE))
    await db.commit()
    tasks.add_task(send_quietly, mailer, record.email, "Your IELTS Fluent AI password was changed",
                   f"Hi {record.name},\n\nYour password was just changed and other devices were signed out. "
                   f"If this wasn't you, reset it at {settings.app_origin}/forgot-password.")
    return {"ok": True}


@router.post("/logout-others")
async def logout_others(request: Request, user: CurrentUser, db: Db) -> dict[str, bool]:
    await revoke_sessions(db, user.id, keep_token=request.cookies.get(SESSION_COOKIE))
    await db.commit()
    return {"ok": True}


@router.get("/export")
async def export(user: CurrentUser, db: Db, settings: AppSettings) -> Response:
    """Everything stored about the user, as a JSON download (GDPR art. 15 and 20)."""
    await rate_limit(db, f"export:{user.id}", 10, 3600)
    practices = (await db.execute(select(Practice).where(Practice.user_id == user.id).order_by(Practice.created_at))).scalars()
    subscribed = (await db.execute(select(Subscriber).where(Subscriber.email == user.email))).scalar_one_or_none()
    data = {
        "exportedAt": datetime.now(UTC).isoformat(),
        "account": user_out(user, settings).model_dump(mode="json", by_alias=True, exclude={"is_admin"}),
        "newsletter": {"subscribed": subscribed is not None, "confirmed": bool(subscribed and subscribed.confirmed_at)},
        "practices": [PracticeOut.model_validate(p).model_dump(mode="json", by_alias=True) for p in practices],
    }
    return Response(json.dumps(data, indent=2, ensure_ascii=False), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="ielts-fluent-data.json"'})


@router.post("/delete")
async def delete_account(body: PasswordConfirmIn, request: Request, response: Response, user: CurrentUser,
                         db: Db, settings: AppSettings) -> dict[str, bool]:
    await _check_password(db, user, body.password)
    if user.stripe_customer_id:
        client = request.app.state.stripe
        if client is None:
            raise AppError(503, "Billing is unavailable, so your subscription can't be cancelled yet. Please contact support.")
        # Cancel first: deleting the account while Stripe keeps charging would be far worse than failing here.
        await cancel_subscriptions(client, user.stripe_customer_id)
    await db.execute(delete(Subscriber).where(Subscriber.email == user.email))
    await db.execute(delete(User).where(User.id == user.id))  # sessions, tokens and practices cascade
    await db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}
