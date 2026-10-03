from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel


class DealStage(str, Enum):
    NEW = "new"
    CLARIFYING = "clarifying"  # waiting for the customer's answers
    REVIEWING = "reviewing"  # analysis done, waiting for AI dev review
    READY = "ready"  # approved, ready to send
    SENT = "sent"  # sent to the customer (manual)
    WON = "won"  # manual
    LOST = "lost"  # manual
    NO_BID = "no_bid"  # presales decided not to bid (Bid/No-bid checklist)


class ClientEmail(BaseModel):
    """Email to the customer with the clarifying questions, in the customer's language.

    The LLM writes the placeholder {{client_name}}; code substitutes the real name, so the
    customer's name never reaches the LLM."""

    subject: str
    body: str


class BidDecision(BaseModel):
    checks: dict[str, bool | None] = {}  # criterion id -> confirmed value (None = not answered)
    decision: Literal["bid", "no_bid"] | None = None
    note: str | None = None
    decided_at: datetime | None = None


class PricingApproval(BaseModel):
    """Second approval level (delivery manager / pricing) after the AI dev's technical approval."""

    approved: bool
    note: str | None = None
    at: datetime


class ProposalVersion(BaseModel):
    """Snapshot of what was (or will be) sent to the customer; numbered 1.0, 1.1, 2.0, ..."""

    version: str
    created_at: datetime
    note: str | None = None
    sent: bool = False
    sent_at: datetime | None = None
    markdown: str | None = None
    proposal_title: str | None = None
    total: float | None = None
    currency: str | None = None
    pattern: str | None = None
