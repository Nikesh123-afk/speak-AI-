import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, StringConstraints, model_validator

Email = Annotated[EmailStr, AfterValidator(lambda v: v.lower()), Field(max_length=254)]


def text(max_length: int) -> type[str]:
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=max_length)]  # type: ignore[return-value]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginIn(Strict):
    email: Email
    password: str = Field(min_length=1, max_length=128)


class SignupIn(Strict):
    name: text(100)
    email: Email
    password: str = Field(min_length=12, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)
    id: uuid.UUID
    name: str
    email: str
    plan: Literal["free", "standard", "premium"]
    created_at: datetime = Field(serialization_alias="createdAt")


class AnswerIn(Strict):
    question: text(1000)
    answer: text(10000)
    part: int | None = Field(None, ge=1, le=3)


class PracticeIn(Strict):
    kind: Literal["practice", "mock"] = "practice"
    topic: text(200)
    part: int | None = Field(None, ge=1, le=3)
    answers: list[AnswerIn] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def check_shape(self) -> "PracticeIn":
        if self.kind == "practice":
            if self.part is None:
                raise ValueError("part is required for practice sessions")
            return self
        # A mock test is one sitting of Part 1, then Part 2, then Part 3, in order.
        parts = [a.part for a in self.answers]
        if self.part is not None or None in parts or parts != sorted(parts) or set(parts) != {1, 2, 3}:
            raise ValueError("a mock test needs answers for Parts 1, 2 and 3, in order")
        if parts.count(2) != 1:
            raise ValueError("a mock test has exactly one Part 2 long turn")
        return self


class PracticeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, serialize_by_alias=True)
    id: uuid.UUID
    kind: str
    topic: str
    part: int | None
    answers: list[dict[str, Any]]
    feedback: dict[str, Any] | None
    status: str
    created_at: datetime = Field(serialization_alias="createdAt")


class PracticePage(BaseModel):
    practices: list[PracticeOut]
    total: int
    offset: int


class SubscribeIn(Strict):
    email: Email


class CheckoutIn(Strict):
    plan: Literal["standard", "premium"]


class UrlOut(BaseModel):
    url: str
