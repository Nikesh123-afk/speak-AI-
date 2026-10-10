import uuid
from types import SimpleNamespace
from urllib.parse import parse_qs

import stripe as stripe_lib
from sqlalchemy import text

from app.config import Settings

from .conftest import ORIGIN, signup
from .test_api import practice

PASSWORD = "correct horse battery"


async def set_plan(engine, email: str, plan: str, customer: str | None = None) -> None:
    async with engine.begin() as c:
        await c.execute(text("UPDATE users SET plan = :plan, stripe_customer_id = :customer WHERE email = :email"),
                        {"plan": plan, "email": email, "customer": customer})


async def assess(client, body: dict) -> dict:
    response = await client.post("/api/feedback", json=body, headers={"idempotency-key": str(uuid.uuid4())})
    assert response.status_code == 201, response.text
    return response.json()["practice"]


# --- Email verification and password reset ---

async def test_signup_sends_verification_and_link_verifies(client, mailer):
    email = await signup(client)
    assert (await client.get("/api/auth/me")).json()["user"]["emailVerifiedAt"] is None
    token = parse_qs(mailer.link(email, "/verify-email"))["token"][0]
    verified = await client.post("/api/auth/verify-email", json={"token": token})
    assert verified.status_code == 200 and verified.json()["user"]["emailVerifiedAt"]
    # Single use.
    assert (await client.post("/api/auth/verify-email", json={"token": token})).status_code == 400
    assert "already" in (await client.post("/api/auth/resend-verification", json={})).json()["message"]


async def test_password_reset_flow(client, make_client, mailer):
    email = await signup(client)
    async with make_client() as other:
        unknown = await other.post("/api/auth/forgot-password", json={"email": "nobody-here@example.com"})
        known = await other.post("/api/auth/forgot-password", json={"email": email})
        # Identical answers, so the endpoint can't be used to discover accounts.
        assert unknown.json() == known.json() and known.status_code == 200
        token = parse_qs(mailer.link(email, "/reset-password"))["token"][0]
        assert (await other.post("/api/auth/reset-password", json={"token": token, "password": "short"})).status_code == 400
        reset = await other.post("/api/auth/reset-password", json={"token": token, "password": "a brand new passphrase"})
        assert reset.status_code == 200 and reset.json()["user"]["emailVerifiedAt"]
        assert (await other.get("/api/auth/me")).json()["user"]["email"] == email
        assert (await other.post("/api/auth/reset-password", json={"token": token, "password": "another new passphrase"})).status_code == 400
    # The old session was revoked, and the old password no longer works.
    assert (await client.get("/api/auth/me")).json()["user"] is None
    assert (await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})).status_code == 401
    assert (await client.post("/api/auth/login", json={"email": email, "password": "a brand new passphrase"})).status_code == 200


# --- Account settings ---

async def test_profile_email_and_password_changes(client, make_client, mailer):
    email = await signup(client)
    assert (await client.patch("/api/account", json={"name": "  Asha  "})).json()["user"]["name"] == "Asha"

    taken = await signup(await make_client().__aenter__())
    assert (await client.post("/api/account/email", json={"email": taken, "password": PASSWORD})).status_code == 409
    assert (await client.post("/api/account/email", json={"email": "x@example.com", "password": "wrong password"})).status_code == 400
    new_email = f"{uuid.uuid4()}@example.com"
    changed = await client.post("/api/account/email", json={"email": new_email, "password": PASSWORD})
    assert changed.status_code == 200 and changed.json()["user"]["email"] == new_email
    assert changed.json()["user"]["emailVerifiedAt"] is None
    assert mailer.link(new_email, "/verify-email")
    assert any(m["to"] == email and "changed" in m["subject"] for m in mailer.sent)

    async with make_client() as laptop:
        await laptop.post("/api/auth/login", json={"email": new_email, "password": PASSWORD})
        assert (await client.get("/api/account/sessions")).json()["active"] == 2
        bad = await client.post("/api/account/password", json={"current_password": "nope", "new_password": "another long passphrase"})
        assert bad.status_code == 400
        ok = await client.post("/api/account/password", json={"current_password": PASSWORD, "new_password": "another long passphrase"})
        assert ok.status_code == 200
        # This device stays signed in; the other one is signed out.
        assert (await client.get("/api/auth/me")).json()["user"]
        assert (await laptop.get("/api/auth/me")).json()["user"] is None


async def test_logout_others(client, make_client):
    email = await signup(client)
    async with make_client() as phone:
        await phone.post("/api/auth/login", json={"email": email, "password": PASSWORD})
        assert (await client.post("/api/account/logout-others", json={})).status_code == 200
        assert (await phone.get("/api/auth/me")).json()["user"] is None
        assert (await client.get("/api/auth/me")).json()["user"]


async def test_export_and_delete(client, assessor):
    email = await signup(client)
    await client.post("/api/subscribe", json={"email": email})
    await assess(client, practice())
    export = await client.get("/api/account/export")
    assert export.status_code == 200 and "attachment" in export.headers["content-disposition"]
    data = export.json()
    assert data["account"]["email"] == email and "password_hash" not in str(data)
    assert len(data["practices"]) == 1 and data["newsletter"]["subscribed"]

    assert (await client.post("/api/account/delete", json={"password": "wrong password"})).status_code == 400
    assert (await client.post("/api/account/delete", json={"password": PASSWORD})).status_code == 200
    assert (await client.get("/api/auth/me")).json()["user"] is None
    assert (await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})).status_code == 401


# --- Practice history, progress and usage ---

async def test_practice_detail_progress_and_usage(client, make_client):
    await signup(client)
    usage = (await client.get("/api/usage")).json()
    assert usage == {"limit": 3, "used": 0, "left": 3}
    done = await assess(client, practice())
    assert (await client.get("/api/usage")).json()["left"] == 2

    detail = await client.get(f"/api/practices/{done['id']}")
    assert detail.status_code == 200 and detail.json()["practice"]["feedback"]["summary"]
    assert (await client.get(f"/api/practices/{uuid.uuid4()}")).status_code == 404
    async with make_client() as stranger:
        await signup(stranger)
        assert (await stranger.get(f"/api/practices/{done['id']}")).status_code == 404

    points = (await client.get("/api/progress")).json()["points"]
    assert len(points) == 1 and points[0]["criteria"]["Coherence"] == 6.5 and points[0]["part"] == 1


async def test_part_2_and_3_practice(client, engine):
    email = await signup(client)
    cue = {"topic": "A place", "part": 2, "answers": [{"question": "Describe a place.", "answer": "I went to the coast."}]}
    locked = await client.post("/api/feedback", json=cue, headers={"idempotency-key": str(uuid.uuid4())})
    assert locked.status_code == 403
    await set_plan(engine, email, "standard")
    assert (await assess(client, cue))["part"] == 2
    assert (await assess(client, {**cue, "part": 3}))["part"] == 3
    assert (await client.get("/api/usage")).json()["left"] is None


async def test_topics_cover_every_part(client):
    topics = (await client.get("/api/topics")).json()
    assert len(topics["part1"]) >= 8 and len(topics["part3"]) >= 5
    assert all(card["question"].startswith(card["prompt"]) for card in topics["part2"])
    assert len((await client.get("/api/mock-tests")).json()) == 5
    config = (await client.get("/api/config")).json()
    assert config["freeAssessments"] == 3 and "supportEmail" in config


# --- Newsletter double opt-in ---

async def test_newsletter_double_opt_in_and_unsubscribe(client, engine, mailer):
    email = f"{uuid.uuid4()}@example.com"
    assert (await client.post("/api/subscribe", json={"email": email})).status_code == 200
    query = parse_qs(mailer.link(email, "/newsletter/confirm"))
    body = {"email": query["email"][0], "token": query["token"][0]}
    assert (await client.post("/api/subscribe/confirm", json={**body, "token": "0" * 64})).status_code == 400
    assert (await client.post("/api/subscribe/confirm", json=body)).status_code == 200
    async with engine.connect() as c:
        assert (await c.execute(text("SELECT confirmed_at FROM subscribers WHERE email = :e"), {"e": email})).scalar()

    from app.routers.meta import newsletter_link
    settings = Settings(app_origin=ORIGIN, _env_file=None)
    unsub = parse_qs(newsletter_link(settings, "unsubscribe", email).split("?", 1)[1])
    # A confirm token can't be used to unsubscribe, and vice versa.
    assert (await client.post("/api/subscribe/unsubscribe", json=body)).status_code == 400
    assert (await client.post("/api/subscribe/unsubscribe", json={"email": email, "token": unsub["token"][0]})).status_code == 200
    async with engine.connect() as c:
        assert (await c.execute(text("SELECT count(*) FROM subscribers WHERE email = :e"), {"e": email})).scalar() == 0


async def test_one_click_unsubscribe_skips_csrf(client, engine):
    from app.security import sign
    email = f"{uuid.uuid4()}@example.com"
    await client.post("/api/subscribe", json={"email": email})
    settings = Settings(app_origin=ORIGIN, _env_file=None)
    response = await client.post(f"/api/subscribe/one-click?email={email}&token={sign(settings, 'newsletter-unsubscribe', email)}",
                                 content="List-Unsubscribe=One-Click", headers={"x-app-request": "", "origin": "",
                                                                                  "content-type": "application/x-www-form-urlencoded"})
    assert response.status_code == 200
    async with engine.connect() as c:
        assert (await c.execute(text("SELECT count(*) FROM subscribers WHERE email = :e"), {"e": email})).scalar() == 0


# --- Admin ---

async def test_admin_requires_verified_admin_email(make_client, settings, mailer):
    email = f"admin-{uuid.uuid4()}@example.com"
    admin_settings = settings.model_copy(update={"admin_emails": email})
    async with make_client(admin_settings) as c:
        await signup(c, email)
        assert (await c.get("/api/admin/stats")).status_code == 404  # unverified
        token = parse_qs(mailer.link(email, "/verify-email"))["token"][0]
        await c.post("/api/auth/verify-email", json={"token": token})
        assert (await c.get("/api/auth/me")).json()["user"]["isAdmin"] is True
        stats = (await c.get("/api/admin/stats")).json()
        assert stats["users"]["total"] >= 1 and len(stats["daily"]) == 14
    async with make_client(admin_settings) as other:
        await signup(other)
        assert (await other.get("/api/admin/stats")).status_code == 404


# --- SEO ---

async def test_robots_and_sitemap(client):
    robots = await client.get("/robots.txt")
    assert "Disallow: /api/" in robots.text and f"{ORIGIN}/sitemap.xml" in robots.text
    sitemap = await client.get("/sitemap.xml")
    assert sitemap.headers["content-type"].startswith("application/xml") and f"<loc>{ORIGIN}/privacy</loc>" in sitemap.text


async def test_missing_client_address_does_not_crash(engine, settings, assessor, mailer):
    import httpx
    from app.main import create_app
    app = create_app(settings, engine=engine, assessor=assessor, feedback_available=True, mailer=mailer)
    transport = httpx.ASGITransport(app=app, client=None, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", headers={"x-app-request": "1"}) as c:
        response = await c.post("/api/auth/login", json={"email": "a@example.com", "password": "whatever"})
        assert response.status_code == 401


# --- Billing with a fake Stripe ---

class Sub(dict):
    """Stripe objects support both attribute and item access."""
    def __getattr__(self, name):
        return self[name]


def subscription(sub_id: str, status: str, price: str) -> Sub:
    return Sub(id=sub_id, status=status, items=SimpleNamespace(data=[SimpleNamespace(price=SimpleNamespace(id=price))]))


class FakeStripe:
    def __init__(self) -> None:
        self.subscriptions: list[Sub] = []
        self.cancelled: list[str] = []
        self.checkouts: list[dict] = []
        self.event = None
        outer = self

        async def create_customer(params, options=None):
            return SimpleNamespace(id=f"cus_{uuid.uuid4().hex[:10]}")

        async def list_subscriptions(params):
            return SimpleNamespace(data=outer.subscriptions)

        async def cancel(sub_id):
            outer.cancelled.append(sub_id)

        async def create_checkout(params, options=None):
            outer.checkouts.append(params)
            return SimpleNamespace(url="https://checkout.stripe.test/session")

        async def create_portal(params):
            return SimpleNamespace(url="https://billing.stripe.test/portal")

        self.v1 = SimpleNamespace(
            customers=SimpleNamespace(create_async=create_customer),
            subscriptions=SimpleNamespace(list_async=list_subscriptions, cancel_async=cancel),
            checkout=SimpleNamespace(sessions=SimpleNamespace(create_async=create_checkout)),
            billing_portal=SimpleNamespace(sessions=SimpleNamespace(create_async=create_portal)),
        )

    def construct_event(self, payload, signature, secret):
        if signature != "valid":
            raise stripe_lib.SignatureVerificationError("bad", signature)
        return self.event


def billing_settings(settings: Settings) -> Settings:
    return settings.model_copy(update={"stripe_secret_key": "sk_test", "stripe_webhook_secret": "whsec",
                                       "stripe_standard_price_id": "price_std", "stripe_premium_price_id": "price_prem"})


def event(customer: str, kind: str = "customer.subscription.updated") -> SimpleNamespace:
    return SimpleNamespace(id=f"evt_{uuid.uuid4().hex}", type=kind, data=SimpleNamespace(object={"customer": customer}))


async def webhook(client, fake: FakeStripe, evt) -> int:
    fake.event = evt
    response = await client.post("/api/billing/webhook", content=b"{}", headers={"stripe-signature": "valid", "x-app-request": "",
                                                                                  "origin": "", "content-type": "application/json"})
    return response.status_code


async def plan_of(client) -> str:
    return (await client.get("/api/auth/me")).json()["user"]["plan"]


async def test_checkout_and_portal(make_client, settings):
    fake = FakeStripe()
    async with make_client(billing_settings(settings), stripe=fake) as c:
        await signup(c)
        assert (await c.post("/api/billing/portal", json={})).status_code == 400  # no customer yet
        checkout = await c.post("/api/billing/checkout", json={"plan": "premium"})
        assert checkout.status_code == 200 and checkout.json()["url"].startswith("https://checkout")
        assert fake.checkouts[-1]["line_items"][0]["price"] == "price_prem"
        assert fake.checkouts[-1]["success_url"] == f"{ORIGIN}/dashboard?checkout=success"
        portal = await c.post("/api/billing/portal", json={})
        assert portal.status_code == 200 and "portal" in portal.json()["url"]
        # An unfinished subscription blocks a second checkout.
        fake.subscriptions = [subscription("sub_1", "incomplete", "price_prem")]
        assert (await c.post("/api/billing/checkout", json={"plan": "standard"})).status_code == 409


async def test_webhook_grants_and_revokes_plans(make_client, settings, engine):
    fake = FakeStripe()
    async with make_client(billing_settings(settings), stripe=fake) as c:
        email = await signup(c)
        customer = f"cus_{uuid.uuid4().hex[:10]}"
        await set_plan(engine, email, "free", customer)

        fake.subscriptions = [subscription("sub_s", "active", "price_std")]
        assert await webhook(c, fake, event(customer)) == 200
        assert await plan_of(c) == "standard"

        # Premium wins over Standard when both are active.
        fake.subscriptions.append(subscription("sub_p", "trialing", "price_prem"))
        assert await webhook(c, fake, event(customer)) == 200
        assert await plan_of(c) == "premium"

        # A replayed event is ignored, even if Stripe's state has changed since.
        replay = event(customer)
        assert await webhook(c, fake, replay) == 200
        fake.subscriptions = [subscription("sub_p", "canceled", "price_prem")]
        assert await webhook(c, fake, replay) == 200
        assert await plan_of(c) == "premium"

        # Cancelled or unpaid subscriptions return the user to Free.
        fake.subscriptions = [subscription("sub_p", "canceled", "price_prem"), subscription("sub_s", "past_due", "price_std")]
        assert await webhook(c, fake, event(customer, "customer.subscription.deleted")) == 200
        assert await plan_of(c) == "free"

        assert await webhook(c, fake, event("cus_deleted_user")) == 200
        fake.event = event(customer)
        bad = await c.post("/api/billing/webhook", content=b"{}", headers={"stripe-signature": "forged", "x-app-request": "", "origin": ""})
        assert bad.status_code == 400


async def test_delete_account_cancels_subscription(make_client, settings, engine):
    fake = FakeStripe()
    async with make_client(billing_settings(settings), stripe=fake) as c:
        email = await signup(c)
        await set_plan(engine, email, "premium", f"cus_{uuid.uuid4().hex[:10]}")
        fake.subscriptions = [subscription("sub_live", "active", "price_prem"), subscription("sub_old", "canceled", "price_std")]
        assert (await c.post("/api/account/delete", json={"password": PASSWORD})).status_code == 200
        assert fake.cancelled == ["sub_live"]
