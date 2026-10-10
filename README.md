# IELTS Fluent AI

IELTS Speaking practice: an examiner reads questions aloud, the candidate answers by voice, and an AI coach gives criterion-level feedback from the transcript.

```
frontend/   React 19 + TypeScript, Vite, Tailwind CSS 4, React Router, TanStack Query
backend/    Python 3.12, FastAPI, SQLAlchemy 2 (async) + asyncpg, Alembic, Pydantic
            PostgreSQL · argon2id · Gemini · Stripe
legacy/     Previous Node.js implementation, kept for reference — safe to delete
```

## Local development

Requirements: Python 3.12, Node 24, pnpm. No Docker or PostgreSQL install needed — development and tests use an embedded PostgreSQL 16 (`pgserver`).

```bash
# API → http://localhost:8000  (docs at /api/docs)
cd backend
py -3.12 -m venv .venv            # macOS/Linux: python3.12 -m venv .venv
.venv/Scripts/pip install -e ".[dev]"   # macOS/Linux: .venv/bin/pip
.venv/Scripts/uvicorn app.main:create_app --factory --reload

# Web → http://localhost:5173  (proxies /api to :8000)
cd frontend
pnpm install
pnpm dev
```

Migrations run automatically in development. Data lives in `.data/pg`.

Demo accounts: `cd backend && .venv/Scripts/python -m app.seed` creates `demo@ieltsfluent.dev` (free) and `premium@ieltsfluent.dev` (premium, with sample history), both with password `practice-speaking-2026`. The script refuses to run in production.

Optional: copy `.env.example` to `.env` and add `GEMINI_API_KEY` to turn on feedback, and the four `STRIPE_*` values to turn on paid plans.

## Checks

```bash
cd backend  && .venv/Scripts/python -m pytest          # API tests against real PostgreSQL
cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Architecture notes

- **One origin in production.** The Docker image builds the SPA and FastAPI serves it, so cookies are first-party and there is no CORS surface.
- **Auth.** argon2id password hashes; random 256-bit session tokens stored only as SHA-256 hashes; `HttpOnly`, `SameSite=Lax`, `Secure` in production. Sessions rotate on login.
- **CSRF.** Every state-changing request needs `X-App-Request: 1`, a matching `Origin` and a JSON body. The Stripe webhook is exempt and verified by signature instead.
- **Rate limits** live in PostgreSQL, so they hold across instances.
- **Feedback** is idempotent: the client sends an `Idempotency-Key` per attempt, so retries never re-run or re-count an assessment. The provider call happens outside any transaction. Failed attempts don't use free quota.
- **Billing.** Plans change only from verified Stripe webhooks, which re-read the customer's subscriptions so out-of-order events are harmless.
- **Headers.** Strict CSP (`'self'` only — fonts are self-hosted), HSTS in production, `nosniff`, `frame-ancestors 'none'`, request IDs on every response.

## Production

```bash
cp .env.example .env    # set APP_ORIGIN=https://…, POSTGRES_PASSWORD, keys
docker compose up --build
```

On any container platform:

1. Provide PostgreSQL via `DATABASE_URL` (plain `postgres://` URLs are accepted).
2. Set `APP_ENV=production` and an `https://` `APP_ORIGIN`. The app refuses to start without both.
3. Run `alembic upgrade head` as a release step before new instances start.
4. Set `FORWARDED_ALLOW_IPS` to your load balancer's address so client IPs (used for rate limits) are trusted only from it.
5. Probes: `/api/health` (liveness), `/api/ready` (database).

### Stripe

Create recurring Standard and Premium prices; set `STRIPE_SECRET_KEY`, `STRIPE_STANDARD_PRICE_ID`, `STRIPE_PREMIUM_PRICE_ID`. Add a webhook to `https://<origin>/api/billing/webhook` for `customer.subscription.*`, `invoice.paid` and `invoice.payment_failed`, and set `STRIPE_WEBHOOK_SECRET`. Enable the Customer Portal in Stripe settings. Local testing: `stripe listen --forward-to localhost:8000/api/billing/webhook`.

## Assessment scope

Feedback is generated from text only. Coherence, Lexical Resource and Grammatical Range are scored in half bands; pronunciation and an overall band are intentionally not scored. This is practice guidance, not an official IELTS result.
