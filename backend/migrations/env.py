import asyncio

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings
from app.db import resolve_database_url
from app.models import Base

config = context.config
url = config.attributes.get("database_url") or resolve_database_url(get_settings())


def run(connection) -> None:
    context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
    with context.begin_transaction():
        # Serialise concurrent release jobs so only one applies migrations.
        context.execute("SELECT pg_advisory_xact_lock(734815)")
        context.run_migrations()


async def main() -> None:
    engine = create_async_engine(url)
    async with engine.connect() as connection:
        await connection.run_sync(run)
    await engine.dispose()


asyncio.run(main())
