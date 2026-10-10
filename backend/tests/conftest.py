import itertools
import re
import tempfile
import uuid

import httpx
import pgserver
import pytest
from sqlalchemy.ext.asyncio import AsyncEngine

from app.config import Settings
from app.db import create_engine, migrate
from app.main import create_app

ORIGIN = "http://localhost:5173"
HEADERS = {"x-app-request": "1", "origin": ORIGIN}
_ips = (f"198.51.100.{n}" for n in itertools.count(1))


@pytest.fixture(scope="session")
def database_url():
    server = pgserver.get_server(tempfile.mkdtemp(prefix="ielts-test-"), cleanup_mode="stop")
    yield server.get_uri().replace("postgresql://", "postgresql+asyncpg://", 1)


@pytest.fixture(scope="session")
async def engine(database_url) -> AsyncEngine:
    await migrate(database_url)
    engine = create_engine(database_url)
    yield engine
    await engine.dispose()


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings(app_env="test", app_origin=ORIGIN, database_url="", gemini_api_key="", stripe_secret_key="",
                    stripe_webhook_secret="", stripe_standard_price_id="", stripe_premium_price_id="", _env_file=None)


class FakeAssessor:
    def __init__(self) -> None:
        self.calls = 0
        self.fail = False

    async def __call__(self, practice):
        self.calls += 1
        if self.fail:
            raise RuntimeError("provider down: secret detail")
        return {"criteria": {"Coherence": 6.5, "Lexical Resource": 6.0, "Grammatical Range": 6.0, "Pronunciation": None},
                "strengths": ["Clear answer"], "improvements": ["Add an example"], "summary": "Transcript only."}


@pytest.fixture
def assessor() -> FakeAssessor:
    return FakeAssessor()


class FakeMailer:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    async def __call__(self, to, subject, body, headers=None):
        self.sent.append({"to": to, "subject": subject, "body": body, "headers": headers or {}})

    def link(self, to: str, path: str) -> str:
        """The token from the latest email to `to` containing a link to `path`."""
        for mail in reversed(self.sent):
            if mail["to"] == to and (match := re.search(re.escape(path) + r"\?(\S+)", mail["body"])):
                return match.group(1)
        raise AssertionError(f"no {path} email to {to}")


@pytest.fixture
def mailer() -> FakeMailer:
    return FakeMailer()


@pytest.fixture
def make_client(engine, settings, assessor, mailer):
    """Each client gets its own IP and cookie jar, like a separate browser."""
    def build(app_settings: Settings | None = None, stripe=None) -> httpx.AsyncClient:
        app = create_app(app_settings or settings, engine=engine, assessor=assessor, feedback_available=True, mailer=mailer)
        if stripe is not None:
            app.state.stripe = stripe
        transport = httpx.ASGITransport(app=app, client=(next(_ips), 50000), raise_app_exceptions=False)
        return httpx.AsyncClient(transport=transport, base_url="http://test", headers=HEADERS)
    return build


@pytest.fixture
async def client(make_client):
    async with make_client() as c:
        yield c


async def signup(client: httpx.AsyncClient, email: str | None = None) -> str:
    email = email or f"{uuid.uuid4()}@example.com"
    response = await client.post("/api/auth/signup", json={"name": "Test User", "email": email, "password": "correct horse battery"})
    assert response.status_code == 201, response.text
    return email
