import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert

from ..deps import CurrentUser, Db, get_assessor
from ..errors import AppError
from ..feedback import Assessor
from ..models import Practice, User
from ..schemas import PracticeIn, PracticeOut, PracticePage
from ..security import rate_limit

router = APIRouter(prefix="/api", tags=["practice"])
FREE_ASSESSMENTS = 3


@router.get("/practices")
async def history(user: CurrentUser, db: Db, offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
                  limit: Annotated[int, Query(ge=1, le=100)] = 20) -> PracticePage:
    done = (Practice.user_id == user.id) & (Practice.status == "complete")
    rows = (await db.execute(select(Practice).where(done).order_by(Practice.created_at.desc()).limit(limit).offset(offset))).scalars()
    total = (await db.execute(select(func.count()).select_from(Practice).where(done))).scalar_one()
    return PracticePage(practices=[PracticeOut.model_validate(p) for p in rows], total=total, offset=offset)


@router.post("/feedback", status_code=201, response_model=dict[str, PracticeOut])
async def feedback(body: PracticeIn, request: Request, response: Response, user: CurrentUser, db: Db,
                   assessor: Annotated[Assessor, Depends(get_assessor)],
                   idempotency_key: Annotated[uuid.UUID, Header()]):
    if not request.app.state.feedback_available:
        raise AppError(503, "Speaking feedback is not available yet. Your answers remain on this screen.")
    await rate_limit(db, f"feedback:{user.id}", 30, 3600)
    answers = [a.model_dump(exclude_none=True) for a in body.answers]

    # Reserve the attempt in one transaction so quota checks and retries cannot race each other.
    plan = (await db.execute(select(User.plan).where(User.id == user.id).with_for_update())).scalar_one()
    # Requests left pending past the provider's hard timeout were abandoned; release their quota.
    await db.execute(update(Practice).where(Practice.user_id == user.id, Practice.status == "pending",
                                            Practice.created_at < func.now() - func.make_interval(0, 0, 0, 0, 0, 2)).values(status="failed"))
    prior = (await db.execute(select(Practice).where(Practice.user_id == user.id, Practice.request_key == idempotency_key))).scalar_one_or_none()
    if prior:
        if (prior.kind, prior.topic, prior.part, prior.answers) != (body.kind, body.topic, body.part, answers):
            raise AppError(409, "This request key was already used for different answers.")
        if prior.status == "complete":
            cached = PracticeOut.model_validate(prior)  # before rollback, which expires loaded rows
            await db.rollback()
            response.status_code = 200
            return {"practice": cached}
        if prior.status == "pending":
            raise AppError(409, "This assessment is already running. Please wait before retrying.")
    if plan == "free":
        if body.kind == "mock":
            raise AppError(403, "Full mock tests are included in the Standard and Premium plans.")
        if body.part != 1:
            raise AppError(403, "Your plan includes Part 1 practice.")
        used = (await db.execute(select(func.count()).select_from(Practice).where(
            Practice.user_id == user.id, Practice.status.in_(("pending", "complete"))))).scalar_one()
        if used >= FREE_ASSESSMENTS:
            raise AppError(403, "Your three free assessments have been used. Choose a paid plan to continue.")
    practice_id = (await db.execute(
        insert(Practice).values(id=uuid.uuid4(), user_id=user.id, request_key=idempotency_key, kind=body.kind,
                                topic=body.topic, part=body.part, answers=answers, status="pending")
        .on_conflict_do_update(constraint="practices_request_key", set_={"status": "pending", "created_at": func.now()})
        .returning(Practice.id)
    )).scalar_one()
    await db.commit()

    # The provider call happens outside any transaction so no row lock is held while waiting on it.
    try:
        result = await assessor(body)
    except BaseException:
        await db.execute(update(Practice).where(Practice.id == practice_id).values(status="failed"))
        await db.commit()
        raise
    practice = (await db.execute(update(Practice).where(Practice.id == practice_id)
                                 .values(feedback=result, status="complete").returning(Practice))).scalar_one()
    await db.commit()
    return {"practice": PracticeOut.model_validate(practice)}
