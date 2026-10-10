import asyncio
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from .config import Settings

BACKEND_DIR = Path(__file__).resolve().parent.parent


def create_engine(url: str) -> AsyncEngine:
    return create_async_engine(
        url, pool_size=10, max_overflow=5, pool_pre_ping=True, pool_timeout=5,
        connect_args={"server_settings": {"statement_timeout": "10000"}, "timeout": 5},
    )


def local_database_url() -> str:
    """Start (or reuse) an embedded PostgreSQL for development. Never used in production."""
    import pgserver  # dev-only dependency

    data = BACKEND_DIR.parent / ".data" / "pg"
    data.mkdir(parents=True, exist_ok=True)
    server = pgserver.get_server(str(data), cleanup_mode=None)
    return server.get_uri().replace("postgresql://", "postgresql+asyncpg://", 1)


def resolve_database_url(settings: Settings) -> str:
    if settings.database_url:
        return settings.database_url
    if settings.production:
        raise RuntimeError("PostgreSQL is required in production")
    return local_database_url()


def alembic_config(url: str) -> AlembicConfig:
    config = AlembicConfig(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    config.attributes["database_url"] = url
    return config


async def migrate(url: str) -> None:
    # Alembic's env.py runs its own event loop, so it must run off the server's loop.
    await asyncio.to_thread(command.upgrade, alembic_config(url), "head")
