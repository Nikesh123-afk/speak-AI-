from fastapi import APIRouter, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from ..deps import AppSettings, Db, MaybeUser
from ..errors import AppError
from ..models import AuthSession, User
from ..schemas import LoginIn, SignupIn, UserOut
from ..security import SESSION_COOKIE, create_session, digest, hash_password, rate_limit, valid_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


async def _drop_current_session(db: Db, request: Request) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if valid_token(token):
        await db.execute(delete(AuthSession).where(AuthSession.token_hash == digest(token)))


@router.get("/me")
async def me(user: MaybeUser) -> dict[str, UserOut | None]:
    return {"user": UserOut.model_validate(user) if user else None}


@router.post("/signup", status_code=201)
async def signup(body: SignupIn, request: Request, response: Response, db: Db, settings: AppSettings) -> dict[str, UserOut]:
    await rate_limit(db, f"auth-ip:{request.client.host}", 20, 900)
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
    await db.commit()
    return {"user": UserOut.model_validate(user)}


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response, db: Db, settings: AppSettings) -> dict[str, UserOut]:
    await rate_limit(db, f"auth-ip:{request.client.host}", 20, 900)
    await rate_limit(db, f"auth-account:{body.email}", 15, 900)
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not await verify_password(body.password, user.password_hash if user else None) or user is None:
        raise AppError(401, "Invalid email or password.")
    await _drop_current_session(db, request)
    await create_session(db, response, user.id, settings)
    await db.commit()
    return {"user": UserOut.model_validate(user)}


@router.post("/logout")
async def logout(request: Request, response: Response, db: Db) -> dict[str, bool]:
    await _drop_current_session(db, request)
    await db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}
