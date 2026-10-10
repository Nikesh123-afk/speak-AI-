"""Create demo accounts for local development: `python -m app.seed`. Refuses to run in production."""
import asyncio
import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from .config import get_settings
from .db import create_engine, migrate, resolve_database_url
from .models import Practice, User
from .security import hash_password

PASSWORD = "practice-speaking-2026"
ACCOUNTS = [("Demo Learner", "demo@ieltsfluent.dev", "free"), ("Premium Learner", "premium@ieltsfluent.dev", "premium")]
SAMPLE = {
    "criteria": {"Coherence": 6.5, "Lexical Resource": 6.0, "Grammatical Range": 6.5, "Pronunciation": None},
    "strengths": ["You answered directly and then gave a reason, which keeps answers easy to follow."],
    "improvements": ["Replace general words like “nice” with precise ones such as “lively” or “close-knit”."],
    "summary": "A clear, well-organised answer. Feedback is based on the transcript only.",
}


async def main() -> None:
    settings = get_settings()
    if settings.production:
        raise SystemExit("Refusing to seed a production database.")
    url = resolve_database_url(settings)
    await migrate(url)
    engine = create_engine(url)
    password_hash = await hash_password(PASSWORD)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        for name, email, plan in ACCOUNTS:
            user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if user is None:
                user = User(name=name, email=email, password_hash=password_hash, plan=plan)
                db.add(user)
                await db.flush()
            else:
                user.password_hash, user.plan = password_hash, plan
            # Premium gets sample history so the dashboard has something to show; free keeps all 3 sessions.
            await db.execute(delete(Practice).where(Practice.user_id == user.id))
            if plan == "premium":
                db.add(Practice(user_id=user.id, request_key=uuid.uuid4(), topic="Hometown & Home", part=1, status="complete",
                                answers=[{"question": "Where are you from?", "answer": "I'm from a small coastal town in the south."}],
                                feedback=SAMPLE))
        await db.commit()
    await engine.dispose()
    for _, email, plan in ACCOUNTS:
        print(f"{plan:8} {email}  /  {PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
