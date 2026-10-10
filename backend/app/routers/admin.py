from fastapi import APIRouter
from sqlalchemy import text

from ..deps import AdminUser, Db

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats")
async def stats(_: AdminUser, db: Db) -> dict:
    """Aggregate counts only; the admin view never lists other people's answers."""
    plans = dict((await db.execute(text("SELECT plan, count(*) FROM users GROUP BY plan"))).all())
    users = (await db.execute(text("""
        SELECT count(*) AS total,
               count(*) FILTER (WHERE email_verified_at IS NOT NULL) AS verified,
               count(*) FILTER (WHERE created_at > now() - interval '7 days') AS week,
               count(*) FILTER (WHERE created_at > now() - interval '30 days') AS month
        FROM users"""))).one()
    practices = (await db.execute(text("""
        SELECT count(*) FILTER (WHERE status = 'complete') AS complete,
               count(*) FILTER (WHERE status = 'failed') AS failed,
               count(*) FILTER (WHERE status = 'complete' AND kind = 'mock') AS mock,
               count(*) FILTER (WHERE status = 'complete' AND created_at > now() - interval '7 days') AS week,
               count(DISTINCT user_id) FILTER (WHERE created_at > now() - interval '7 days') AS active_week
        FROM practices"""))).one()
    subscribers = (await db.execute(text(
        "SELECT count(*) AS total, count(*) FILTER (WHERE confirmed_at IS NOT NULL) AS confirmed FROM subscribers"))).one()
    daily = (await db.execute(text("""
        SELECT to_char(d, 'YYYY-MM-DD') AS day,
               (SELECT count(*) FROM users WHERE created_at >= d AND created_at < d + interval '1 day') AS signups,
               (SELECT count(*) FROM practices WHERE status = 'complete' AND created_at >= d AND created_at < d + interval '1 day') AS sessions
        FROM generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') AS d
        ORDER BY d"""))).all()
    return {
        "users": {**users._asdict(), "plans": {p: plans.get(p, 0) for p in ("free", "standard", "premium")}},
        "practices": practices._asdict(),
        "subscribers": subscribers._asdict(),
        "daily": [row._asdict() for row in daily],
    }
