from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Settings
from .errors import AppError
from .feedback import Assessor
from .models import AuthSession, User
from .security import SESSION_COOKIE, digest, valid_token


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.sessionmaker() as session:
        yield session


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_assessor(request: Request) -> Assessor:
    return request.app.state.assessor


Db = Annotated[AsyncSession, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]


async def optional_user(request: Request, db: Db) -> User | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not valid_token(token):
        return None
    return (await db.execute(
        select(User).join(AuthSession, AuthSession.user_id == User.id)
        .where(AuthSession.token_hash == digest(token), AuthSession.expires_at > func.now())
    )).scalar_one_or_none()


async def require_user(user: Annotated[User | None, Depends(optional_user)]) -> User:
    if user is None:
        raise AppError(401, "Please log in to continue.")
    return user


CurrentUser = Annotated[User, Depends(require_user)]
MaybeUser = Annotated[User | None, Depends(optional_user)]
