import asyncio
import contextlib
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import stripe
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from . import errors
from .config import Settings, get_settings
from .db import create_engine, migrate, resolve_database_url
from .feedback import Assessor, gemini_assessor
from .routers import auth, billing, meta, practice

log = logging.getLogger("app")
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
CSRF_EXEMPT = {"/api/billing/webhook"}  # Authenticated by Stripe's signature instead.
MAX_BODY = 256 * 1024
CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; "
       "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")


async def _cleanup(app: FastAPI) -> None:
    # Expired rows are indexed, so this is cheap and safe to run on every instance.
    while True:
        await asyncio.sleep(3600)
        try:
            async with app.state.sessionmaker() as db:
                await db.execute(text("DELETE FROM sessions WHERE expires_at < now()"))
                await db.execute(text("DELETE FROM rate_limits WHERE expires_at < now()"))
                await db.commit()
        except Exception:
            log.warning("Expired-record cleanup failed")


def create_app(settings: Settings | None = None, *, engine: AsyncEngine | None = None,
               assessor: Assessor | None = None, feedback_available: bool | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        http = httpx.AsyncClient()
        owned_engine = None
        if app.state.engine is None:
            url = resolve_database_url(settings)
            # Production applies migrations as a release step (`alembic upgrade head`), not at boot.
            if not settings.production:
                await migrate(url)
            app.state.engine = owned_engine = create_engine(url)
            app.state.sessionmaker = async_sessionmaker(owned_engine, expire_on_commit=False)
        if app.state.assessor is None:
            app.state.assessor = gemini_assessor(settings, http)
        cleanup = asyncio.create_task(_cleanup(app))
        yield
        cleanup.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await cleanup
        await http.aclose()
        if owned_engine is not None:
            await owned_engine.dispose()

    app = FastAPI(title="IELTS Fluent AI", lifespan=lifespan, docs_url=None if settings.production else "/api/docs",
                  redoc_url=None, openapi_url=None if settings.production else "/api/openapi.json")
    app.state.settings = settings
    app.state.engine = engine
    app.state.sessionmaker = async_sessionmaker(engine, expire_on_commit=False) if engine else None
    app.state.assessor = assessor
    app.state.feedback_available = bool(settings.gemini_api_key) if feedback_available is None else feedback_available
    app.state.stripe = stripe.StripeClient(settings.stripe_secret_key, http_client=stripe.HTTPXClient(timeout=15),
                                           max_network_retries=1) if settings.stripe_secret_key else None
    errors.install(app)

    @app.middleware("http")
    async def guard(request: Request, call_next):
        request.state.request_id = str(uuid.uuid4())
        path = request.url.path
        if request.method in UNSAFE_METHODS:
            length = request.headers.get("content-length")
            if length and (not length.isdigit() or int(length) > MAX_BODY):
                return errors.error_response(request, 413, "Request is too large.")
            if path not in CSRF_EXEMPT:
                # Browsers cannot send a custom header cross-site without CORS approval, which we never grant.
                origin = request.headers.get("origin")
                if request.headers.get("x-app-request") != "1" or (origin and origin != settings.app_origin):
                    return errors.error_response(request, 403, "Request origin is not allowed.")
                if not request.headers.get("content-type", "").startswith("application/json"):
                    return errors.error_response(request, 415, "Use application/json.")
        response = await call_next(request)
        response.headers["X-Request-Id"] = request.state.request_id
        if path != "/api/docs":  # Swagger UI loads from a CDN; it only exists outside production.
            response.headers["Content-Security-Policy"] = CSP
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "microphone=(self), camera=(), geolocation=()"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        if settings.production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        if path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    for module in (meta, auth, practice, billing):
        app.include_router(module.router)

    static = Path(settings.static_dir) if settings.static_dir else None
    if static and (static / "index.html").is_file():
        app.mount("/assets", StaticFiles(directory=static / "assets"), name="assets")
        index = static / "index.html"

        @app.get("/{path:path}", include_in_schema=False)
        async def spa(path: str):
            if path.startswith("api/"):
                raise HTTPException(404)
            candidate = (static / path).resolve()
            if path and candidate.is_file() and candidate.is_relative_to(static.resolve()):
                return FileResponse(candidate)
            return FileResponse(index, headers={"Cache-Control": "no-cache"})

    return app
