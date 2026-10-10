from datetime import UTC, datetime
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy import delete, select, text, update
from sqlalchemy.dialects.postgresql import insert

from ..config import Settings
from ..deps import AppMailer, AppSettings, Db
from ..errors import AppError
from ..mail import send_quietly
from ..mock_tests import MOCK_TESTS
from ..models import Subscriber
from ..schemas import EmailIn, SignedEmailIn
from ..security import client_ip, rate_limit, sign, signature_ok
from ..topics import TOPICS
from .practice import FREE_ASSESSMENTS

router = APIRouter(prefix="/api", tags=["meta"])
seo = APIRouter(include_in_schema=False)
PUBLIC_PAGES = ["/", "/login", "/signup", "/privacy", "/terms", "/contact"]


def newsletter_link(settings: Settings, action: str, email: str) -> str:
    return f"{settings.app_origin}/newsletter/{action}?email={quote(email)}&token={sign(settings, 'newsletter-' + action, email)}"


@router.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@router.get("/ready")
async def ready(db: Db) -> dict[str, bool]:
    await db.execute(text("SELECT 1"))
    return {"ok": True}


@router.get("/config")
async def config(request: Request) -> dict[str, bool | int | str | None]:
    settings: Settings = request.app.state.settings
    return {"feedbackAvailable": request.app.state.feedback_available, "billingAvailable": settings.billing_available,
            "freeAssessments": FREE_ASSESSMENTS, "supportEmail": settings.support_email or None}


@router.get("/topics")
async def topics() -> dict:
    return TOPICS


@router.get("/mock-tests")
async def mock_tests() -> list[dict]:
    return MOCK_TESTS


@router.post("/subscribe")
async def subscribe(body: EmailIn, request: Request, tasks: BackgroundTasks, db: Db, settings: AppSettings,
                    mailer: AppMailer) -> dict[str, str]:
    await rate_limit(db, f"subscribe:{client_ip(request)}", 5, 3600)
    # Also per address, so the form can't be used to flood someone's inbox.
    await rate_limit(db, f"subscribe-email:{body.email}", 3, 86400)
    await db.execute(insert(Subscriber).values(email=body.email).on_conflict_do_nothing())
    confirmed = (await db.execute(select(Subscriber.confirmed_at).where(Subscriber.email == body.email))).scalar_one()
    await db.commit()
    if confirmed is None:
        tasks.add_task(send_quietly, mailer, body.email, "Confirm your IELTS Fluent AI subscription",
                       "Please confirm you'd like monthly IELTS speaking tips:\n"
                       f"{newsletter_link(settings, 'confirm', body.email)}\n\n"
                       "If you didn't sign up, ignore this email and you won't hear from us.")
    return {"message": "Almost done — check your inbox to confirm your subscription."}


@router.post("/subscribe/confirm")
async def confirm_subscription(body: SignedEmailIn, db: Db, settings: AppSettings) -> dict[str, str]:
    if not signature_ok(settings, "newsletter-confirm", body.email, body.token):
        raise AppError(400, "This confirmation link is invalid.")
    done = (await db.execute(update(Subscriber).where(Subscriber.email == body.email)
                             .values(confirmed_at=datetime.now(UTC)).returning(Subscriber.email))).scalar_one_or_none()
    if done is None:
        raise AppError(400, "This subscription no longer exists. Subscribe again from the footer.")
    await db.commit()
    return {"message": "You're subscribed. Tips arrive once a month."}


@router.post("/subscribe/unsubscribe")
async def unsubscribe(body: SignedEmailIn, db: Db, settings: AppSettings) -> dict[str, str]:
    if not signature_ok(settings, "newsletter-unsubscribe", body.email, body.token):
        raise AppError(400, "This unsubscribe link is invalid.")
    await db.execute(delete(Subscriber).where(Subscriber.email == body.email))
    await db.commit()
    return {"message": "You've been unsubscribed and your address has been deleted."}


@router.post("/subscribe/one-click")
async def one_click_unsubscribe(email: str, token: str, db: Db, settings: AppSettings) -> dict[str, bool]:
    """RFC 8058 one-click unsubscribe from mail clients. CSRF-exempt: the signature is the authorisation."""
    if signature_ok(settings, "newsletter-unsubscribe", email.lower(), token):
        await db.execute(delete(Subscriber).where(Subscriber.email == email.lower()))
        await db.commit()
    return {"ok": True}


@seo.get("/robots.txt")
async def robots(settings: AppSettings) -> PlainTextResponse:
    return PlainTextResponse(
        "User-agent: *\nDisallow: /api/\nDisallow: /dashboard\nDisallow: /account\nDisallow: /admin\n"
        f"Sitemap: {settings.app_origin}/sitemap.xml\n")


@seo.get("/sitemap.xml")
async def sitemap(settings: AppSettings) -> Response:
    urls = "".join(f"<url><loc>{settings.app_origin}{path}</loc></url>" for path in PUBLIC_PAGES)
    return Response(f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>',
                    media_type="application/xml")
