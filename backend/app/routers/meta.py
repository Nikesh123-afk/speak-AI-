from fastapi import APIRouter, Request
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert

from ..deps import Db
from ..models import Subscriber
from ..schemas import SubscribeIn
from ..security import rate_limit
from ..mock_tests import MOCK_TESTS
from ..topics import TOPICS

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@router.get("/ready")
async def ready(db: Db) -> dict[str, bool]:
    await db.execute(text("SELECT 1"))
    return {"ok": True}


@router.get("/config")
async def config(request: Request) -> dict[str, bool]:
    return {"feedbackAvailable": request.app.state.feedback_available, "billingAvailable": request.app.state.settings.billing_available}


@router.get("/topics")
async def topics() -> dict:
    return TOPICS


@router.get("/mock-tests")
async def mock_tests() -> list[dict]:
    return MOCK_TESTS


@router.post("/subscribe")
async def subscribe(body: SubscribeIn, request: Request, db: Db) -> dict[str, str]:
    await rate_limit(db, f"subscribe:{request.client.host}", 5, 3600)
    await db.execute(insert(Subscriber).values(email=body.email).on_conflict_do_nothing())
    await db.commit()
    return {"message": "Thanks — you're on the list."}
