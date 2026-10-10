import time

import stripe
from fastapi import APIRouter, Request
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert

from ..deps import AppSettings, CurrentUser, Db
from ..errors import AppError
from ..models import StripeEvent, User
from ..schemas import CheckoutIn, UrlOut
from ..security import rate_limit

router = APIRouter(prefix="/api/billing", tags=["billing"])
LIVE_STATUSES = ("active", "trialing", "past_due", "incomplete", "unpaid")
HANDLED_EVENTS = {"customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
                  "invoice.paid", "invoice.payment_failed"}


def _client(request: Request) -> stripe.StripeClient:
    client = request.app.state.stripe
    if client is None or not request.app.state.settings.billing_available:
        raise AppError(503, "Purchases are not available yet.")
    return client


async def cancel_subscriptions(client: stripe.StripeClient, customer: str) -> None:
    subscriptions = await client.v1.subscriptions.list_async({"customer": customer, "status": "all", "limit": 100})
    for subscription in subscriptions.data:
        if subscription.status in LIVE_STATUSES:
            await client.v1.subscriptions.cancel_async(subscription.id)


@router.post("/checkout")
async def checkout(body: CheckoutIn, request: Request, user: CurrentUser, db: Db, settings: AppSettings) -> UrlOut:
    await rate_limit(db, f"checkout:{user.id}", 10, 3600)
    client = _client(request)
    price = settings.stripe_standard_price_id if body.plan == "standard" else settings.stripe_premium_price_id
    record = (await db.execute(select(User).where(User.id == user.id).with_for_update())).scalar_one()
    if record.plan != "free":
        raise AppError(409, "You already have a paid plan. Manage it from your dashboard.")
    customer = record.stripe_customer_id
    if not customer:
        created = await client.v1.customers.create_async(
            {"email": record.email, "metadata": {"user_id": str(record.id)}}, {"idempotency_key": f"customer:{record.id}"})
        customer = created.id
        record.stripe_customer_id = customer
    await db.commit()
    existing = await client.v1.subscriptions.list_async({"customer": customer, "status": "all", "limit": 100})
    if any(s.status in ("active", "trialing", "past_due", "incomplete") for s in existing.data):
        raise AppError(409, "An existing subscription needs attention. Manage it from your dashboard.")
    session = await client.v1.checkout.sessions.create_async({
        "mode": "subscription", "customer": customer, "line_items": [{"price": price, "quantity": 1}],
        "client_reference_id": str(user.id),
        "success_url": f"{settings.app_origin}/dashboard?checkout=success",
        "cancel_url": f"{settings.app_origin}/#pricing",
    }, {"idempotency_key": f"checkout:{user.id}:{body.plan}:{int(time.time() // 1800)}"})
    return UrlOut(url=session.url)


@router.post("/portal")
async def portal(request: Request, user: CurrentUser, db: Db, settings: AppSettings) -> UrlOut:
    await rate_limit(db, f"portal:{user.id}", 20, 3600)
    client = _client(request)
    if not user.stripe_customer_id:
        raise AppError(400, "No billing account is associated with this user.")
    session = await client.v1.billing_portal.sessions.create_async({"customer": user.stripe_customer_id, "return_url": f"{settings.app_origin}/dashboard"})
    return UrlOut(url=session.url)


@router.post("/webhook")
async def webhook(request: Request, db: Db, settings: AppSettings) -> dict[str, bool]:
    client = request.app.state.stripe
    if client is None or not settings.stripe_webhook_secret:
        raise AppError(503, "Billing is not configured.")
    try:
        event = client.construct_event(await request.body(), request.headers.get("stripe-signature"), settings.stripe_webhook_secret)
    except (ValueError, stripe.SignatureVerificationError):
        raise AppError(400, "Invalid signature.") from None
    if event.type not in HANDLED_EVENTS:
        return {"received": True}
    customer = event.data.object.get("customer")
    customer = customer if isinstance(customer, str) else customer["id"]

    # Lock the user to serialise deliveries, then read Stripe's current state so event order does not matter.
    user = (await db.execute(select(User).where(User.stripe_customer_id == customer).with_for_update())).scalar_one_or_none()
    if user is None:
        # The customer is stored before checkout starts, so an unknown one belongs to a deleted account.
        return {"received": True}
    fresh = (await db.execute(insert(StripeEvent).values(id=event.id).on_conflict_do_nothing().returning(StripeEvent.id))).scalar_one_or_none()
    if fresh is None:
        await db.rollback()
        return {"received": True}
    plan, subscription_id = "free", None
    subscriptions = await client.v1.subscriptions.list_async({"customer": customer, "status": "all", "limit": 100})
    for subscription in subscriptions.data:
        if subscription.status not in ("active", "trialing"):
            continue
        for item in subscription["items"].data:
            if item.price.id == settings.stripe_premium_price_id:
                plan, subscription_id = "premium", subscription.id
            elif item.price.id == settings.stripe_standard_price_id and plan != "premium":
                plan, subscription_id = "standard", subscription.id
    await db.execute(update(User).where(User.id == user.id).values(plan=plan, stripe_subscription_id=subscription_id))
    await db.commit()
    return {"received": True}
