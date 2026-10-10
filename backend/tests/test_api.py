import uuid

from sqlalchemy import text

from app.config import Settings

from .conftest import signup


def practice(answer: str = "I come from a coastal city.", part: int = 1) -> dict:
    return {"topic": "Hometown", "part": part, "answers": [{"question": "Where are you from?", "answer": answer}]}


async def test_health_and_headers(client):
    assert (await client.get("/api/health")).status_code == 200
    ready = await client.get("/api/ready")
    assert ready.status_code == 200
    assert "default-src 'self'" in ready.headers["content-security-policy"]
    assert ready.headers["cache-control"] == "no-store"
    assert ready.headers["x-request-id"]


async def test_csrf_origin_and_content_type(client):
    body = {"email": "a@example.com", "password": "x"}
    assert (await client.post("/api/auth/login", json=body, headers={"x-app-request": ""})).status_code == 403
    assert (await client.post("/api/auth/login", json=body, headers={"origin": "https://evil.example"})).status_code == 403
    assert (await client.post("/api/auth/login", data={"email": "a"})).status_code == 415


async def test_signup_login_logout(client, make_client):
    email = await signup(client)
    cookie = client.cookies.get("ielts_session")
    assert cookie and len(cookie) == 64
    me = (await client.get("/api/auth/me")).json()["user"]
    assert me["email"] == email and "password_hash" not in me and "createdAt" in me

    assert (await client.post("/api/auth/signup", json={"name": "X", "email": email, "password": "correct horse battery"})).status_code == 409
    short = await client.post("/api/auth/signup", json={"name": "X", "email": "new@example.com", "password": "short"})
    assert short.status_code == 400 and short.json()["fields"][0]["field"] == "password"

    async with make_client() as other:
        assert (await other.post("/api/auth/login", json={"email": email, "password": "wrong password!"})).status_code == 401
        assert (await other.post("/api/auth/login", json={"email": "nobody@example.com", "password": "whatever"})).status_code == 401
        login = await other.post("/api/auth/login", json={"email": email.upper(), "password": "correct horse battery"})
        assert login.status_code == 200
        assert other.cookies.get("ielts_session") != cookie

    await client.post("/api/auth/logout", json={})
    client.cookies.set("ielts_session", cookie)
    assert (await client.get("/api/auth/me")).json()["user"] is None


async def test_feedback_needs_login_and_key(client):
    assert (await client.post("/api/feedback", json=practice(), headers={"idempotency-key": str(uuid.uuid4())})).status_code == 401
    await signup(client)
    assert (await client.post("/api/feedback", json=practice())).status_code == 400


async def test_feedback_idempotent_and_free_quota(client, assessor):
    await signup(client)
    key = str(uuid.uuid4())

    async def send(k=None, body=None):
        return await client.post("/api/feedback", json=body or practice(), headers={"idempotency-key": k or str(uuid.uuid4())})

    first = await send(key)
    assert first.status_code == 201, first.text
    assert first.json()["practice"]["status"] == "complete"
    retry = await send(key)
    assert retry.status_code == 200 and retry.json()["practice"]["id"] == first.json()["practice"]["id"]
    assert assessor.calls == 1
    assert (await send(key, practice("Something else"))).status_code == 409

    assert (await send(body=practice(part=2))).status_code == 403
    assert (await send()).status_code == 201
    assert (await send()).status_code == 201
    assert (await send()).status_code == 403

    page = (await client.get("/api/practices")).json()
    assert page["total"] == 3 and page["practices"][0]["feedback"]["criteria"]["Pronunciation"] is None


async def test_failed_assessment_releases_quota(client, assessor, engine):
    email = await signup(client)
    assessor.fail = True
    response = await client.post("/api/feedback", json=practice(), headers={"idempotency-key": str(uuid.uuid4())})
    assert response.status_code == 500 and "secret detail" not in response.text
    async with engine.connect() as conn:
        statuses = (await conn.execute(text("SELECT p.status FROM practices p JOIN users u ON u.id = p.user_id WHERE u.email = :e"), {"e": email})).scalars().all()
    assert statuses == ["failed"]


async def test_billing_unconfigured(client):
    await signup(client)
    assert (await client.post("/api/billing/checkout", json={"plan": "standard"})).status_code == 503
    assert (await client.post("/api/billing/webhook", content=b"{}")).status_code == 503
    assert (await client.get("/api/config")).json() == {"feedbackAvailable": True, "billingAvailable": False}


async def test_webhook_rejects_bad_signature(make_client, settings):
    configured = Settings(**{**settings.model_dump(), "stripe_secret_key": "sk_test_dummy", "stripe_webhook_secret": "whsec_dummy"}, _env_file=None)
    async with make_client(configured) as c:
        response = await c.post("/api/billing/webhook", content=b'{"id":"evt_1"}', headers={"stripe-signature": "t=1,v1=bad", "x-app-request": ""})
        assert response.status_code == 400


async def test_login_rate_limited_per_ip(client):
    statuses = [(await client.post("/api/auth/login", json={"email": f"{i}@example.com", "password": "x"})).status_code for i in range(22)]
    assert statuses[0] == 401 and statuses[-1] == 429


async def test_subscribe(client):
    response = await client.post("/api/subscribe", json={"email": "Reader@Example.com"})
    assert response.status_code == 200
    assert (await client.post("/api/subscribe", json={"email": "not-an-email"})).status_code == 400


def mock_body() -> dict:
    return {"kind": "mock", "topic": "Test 1", "answers": [
        {"part": 1, "question": "Q1", "answer": "A1"},
        {"part": 2, "question": "Cue card", "answer": "A long turn."},
        {"part": 3, "question": "Q3", "answer": "An opinion."},
    ]}


async def test_mock_tests_listed(client):
    tests = (await client.get("/api/mock-tests")).json()
    assert len(tests) >= 3 and all({"part1", "part2", "part3"} <= t.keys() for t in tests)
    assert "You should say" in tests[0]["part2"]["question"]


async def test_mock_test_requires_paid_plan(client):
    await signup(client)
    response = await client.post("/api/feedback", json=mock_body(), headers={"idempotency-key": str(uuid.uuid4())})
    assert response.status_code == 403 and "mock" in response.json()["error"]


async def test_mock_test_for_paid_plan(client, engine):
    email = await signup(client)
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE users SET plan = 'premium' WHERE email = :e"), {"e": email})
    headers = {"idempotency-key": str(uuid.uuid4())}

    bad = mock_body()
    bad["answers"] = bad["answers"][:2]
    assert (await client.post("/api/feedback", json=bad, headers=headers)).status_code == 400
    shuffled = mock_body()
    shuffled["answers"].reverse()
    assert (await client.post("/api/feedback", json=shuffled, headers=headers)).status_code == 400

    response = await client.post("/api/feedback", json=mock_body(), headers=headers)
    assert response.status_code == 201, response.text
    practice = response.json()["practice"]
    assert practice["kind"] == "mock" and practice["part"] is None
    assert [a["part"] for a in practice["answers"]] == [1, 2, 3]
    history = (await client.get("/api/practices")).json()["practices"]
    assert history[0]["kind"] == "mock"
