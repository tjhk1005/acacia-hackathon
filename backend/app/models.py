"""Wire format matches lib/wedding.ts on codex/wedding-planner-plan."""
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BriefPatch(Model):
    names: Optional[str] = Field(default=None, max_length=200)
    date: Optional[str] = Field(default=None, max_length=10)
    flexibleDate: Optional[bool] = None
    location: Optional[str] = Field(default=None, max_length=200)
    guests: Optional[str] = Field(default=None, max_length=10)
    budget: Optional[str] = Field(default=None, max_length=32)
    keywords: Optional[str] = Field(default=None, max_length=1000)
    style: Optional[Literal["garden", "modern", "coastal"]] = None
    priorities: Optional[List[str]] = Field(default=None, max_length=20)
    notes: Optional[str] = Field(default=None, max_length=8000)

    @field_validator("date")
    @classmethod
    def valid_date(cls, value):
        if value:
            parsed = date.fromisoformat(value)
            if parsed.isoformat() != value:
                raise ValueError("Use YYYY-MM-DD for date")
        return value

    @field_validator("guests")
    @classmethod
    def valid_guests(cls, value):
        if value not in (None, ""):
            if not value.isascii() or not value.isdigit() or not 1 <= int(value) <= 10000:
                raise ValueError("guests must be a whole-number string from 1 to 10000")
            return str(int(value))
        return value

    @field_validator("budget")
    @classmethod
    def valid_budget(cls, value):
        if value not in (None, ""):
            try:
                amount = Decimal(value)
            except InvalidOperation:
                raise ValueError("budget must be a decimal string")
            if not amount.is_finite() or not 0 < amount <= 1000000000:
                raise ValueError("budget must be positive and no more than 1000000000")
            if amount != amount.quantize(Decimal("0.01")):
                raise ValueError("budget supports at most two decimal places")
            return format(amount, "f")
        return value

    @field_validator("priorities")
    @classmethod
    def valid_priorities(cls, value):
        if value is not None and any(not item.strip() or len(item) > 200 for item in value):
            raise ValueError("Each priority must contain 1 to 200 characters")
        return list(dict.fromkeys(value)) if value is not None else None


class WeddingBrief(BriefPatch):
    # Unknowns are empty, not the website's suggested 80 guests / S$20,000.
    names: str = Field(default="", max_length=200)
    date: str = Field(default="", max_length=10)
    flexibleDate: bool = True
    location: str = Field(default="", max_length=200)
    guests: str = Field(default="", max_length=10)
    budget: str = Field(default="", max_length=32)
    keywords: str = Field(default="", max_length=1000)
    style: Literal["garden", "modern", "coastal"] = "garden"
    priorities: List[str] = Field(default_factory=list, max_length=20)
    notes: str = Field(default="", max_length=8000)


class CreateWedding(Model):
    brief: WeddingBrief = Field(default_factory=WeddingBrief)


class UpdateWedding(Model):
    expected_revision: int = Field(ge=0)
    brief: BriefPatch


class ConfirmWedding(Model):
    expected_revision: int = Field(ge=0)


class ChatRequest(Model):
    message: str = Field(min_length=1, max_length=8000)
    expected_revision: int = Field(ge=0)
    request_id: UUID

    @field_validator("message")
    @classmethod
    def nonempty_message(cls, value):
        if not value.strip():
            raise ValueError("message cannot be blank")
        return value.strip()


class PreferenceResult(Model):
    updates: BriefPatch
    reply: str = Field(min_length=1, max_length=3000)
    questions: List[str] = Field(max_length=3)


class BudgetSummary(Model):
    currency: Literal["SGD"]
    total: Optional[str]
    per_guest: Optional[str]
    note: str


class WeddingView(Model):
    id: str
    revision: int
    status: Literal["draft", "confirmed"]
    brief: WeddingBrief
    missing_fields: List[str]
    budget_summary: BudgetSummary
    created_at: str
    updated_at: str


class WeddingResponse(Model):
    wedding: WeddingView


class CreateResponse(WeddingResponse):
    access_token: str


class ChatResponse(WeddingResponse):
    reply: str
    changed_fields: List[str]
    questions: List[str]
    request_id: str
    agent: Literal["preferences"]


class Message(Model):
    role: Literal["user", "assistant"]
    content: str
    created_at: str


class MessagesResponse(Model):
    messages: List[Message]


class CoordinationDraft(Model):
    content: str = Field(min_length=1, max_length=4000)
