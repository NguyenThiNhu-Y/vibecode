from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel

from app.schemas.architecture import ArchitectureResult
from app.schemas.attachments import Attachment
from app.schemas.common import SolutionPattern, StepName
from app.schemas.deal import BidDecision, ClientEmail, DealStage, PricingApproval, ProposalVersion
from app.schemas.effort import EffortBasis
from app.schemas.feasibility import FeasibilityResult
from app.schemas.gaps import GapResult
from app.schemas.intake import IntakeResult
from app.schemas.pattern import PatternResult
from app.schemas.proposal import ProposalResult
from app.schemas.quotation import Currency, Quotation
from app.schemas.requirements import RequirementMatrix
from app.schemas.wbs import Schedule, WBSResult


class RunStatus(str, Enum):
    CREATED = "created"
    RUNNING = "running"
    WAITING_CLARIFICATION = "waiting_clarification"
    DONE = "done"
    FAILED = "failed"
    APPROVED = "approved"
    REJECTED = "rejected"


class ScopingRun(BaseModel):
    id: str  # 8 hex chars
    created_at: datetime
    request_text: str
    status: RunStatus = RunStatus.CREATED
    answers: dict[str, str] = {}  # question.id -> answer
    intake: IntakeResult | None = None
    gaps: GapResult | None = None
    pattern: PatternResult | None = None
    feasibility: FeasibilityResult | None = None
    architecture: ArchitectureResult | None = None
    wbs: WBSResult | None = None
    requirements: RequirementMatrix | None = None
    proposal: ProposalResult | None = None
    error: str | None = None
    reviewer_note: str | None = None
    step_latency_ms: dict[str, int] = {}
    # Additions beyond the original contract (AGENTS.md 4.1, "Mở rộng"):
    effort_basis: EffortBasis | None = None  # how computed_estimates were derived
    feedback: str | None = None  # reviewer feedback for a re-run
    feedback_step: StepName | None = None  # first step re-run with that feedback
    revision: int = 0  # number of re-runs requested by the reviewer
    redactions: dict[str, int] = {}  # PII type -> count masked before sending to the LLM
    proposal_edited: bool = False  # proposal markdown edited by a human
    translations: dict[str, str] = {}  # language -> translated proposal markdown
    attachments: list[Attachment] = []  # files the customer sent, parsed by code
    schedule: Schedule | None = None  # computed from wbs by code
    quotation: Quotation | None = None  # computed from wbs x rate card by code
    client_email: ClientEmail | None = None  # draft email with clarifying questions
    deck_translations: dict[str, dict[str, str]] = {}  # language -> original -> translated
    # Deal management (never sent to the LLM)
    project_name: str | None = None
    client_name: str | None = None
    due_date: date | None = None  # proposal submission deadline
    deal_stage: DealStage = DealStage.NEW
    bid: BidDecision | None = None
    pricing_approval: PricingApproval | None = None
    versions: list[ProposalVersion] = []


class RunSummary(BaseModel):
    id: str
    created_at: datetime
    status: RunStatus
    business_goal: str | None = None
    pattern: SolutionPattern | None = None
    project_name: str | None = None
    client_name: str | None = None
    due_date: date | None = None
    deal_stage: DealStage = DealStage.NEW
    quote_total: float | None = None
    quote_currency: Currency | None = None
    total_ms: int = 0

    @classmethod
    def from_run(cls, run: ScopingRun) -> "RunSummary":
        return cls(
            id=run.id,
            created_at=run.created_at,
            status=run.status,
            business_goal=run.intake.business_goal if run.intake else None,
            pattern=run.pattern.pattern if run.pattern else None,
            project_name=run.project_name,
            client_name=run.client_name,
            due_date=run.due_date,
            deal_stage=run.deal_stage,
            quote_total=run.quotation.total if run.quotation else None,
            quote_currency=run.quotation.currency if run.quotation else None,
            total_ms=sum(run.step_latency_ms.values()),
        )
