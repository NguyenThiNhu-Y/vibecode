from typing import Literal

from pydantic import BaseModel

from app.schemas.common import Phase

Currency = Literal["VND", "JPY", "USD"]
ContractModel = Literal["fixed_price", "time_material", "odc"]


class QuoteLine(BaseModel):
    phase: Phase
    role_key: str
    role_label: str
    person_days: float  # WBS leaves are man-days with decimals
    day_rate: float
    amount: float
    kind: Literal["wbs", "overhead"] = "wbs"


class PhaseCost(BaseModel):
    phase: Phase
    person_days: float
    amount: float  # from the WBS
    min_amount: float  # estimate range x blended rate of the phase
    max_amount: float


class Milestone(BaseModel):
    name: str
    percent: float
    amount: float


class OdcMember(BaseModel):
    role_label: str
    fte: float
    monthly_cost: float


class Quotation(BaseModel):
    """Preliminary price, computed by code from WBS x rate card (app/agents/pricing.py)."""

    currency: Currency
    contract_model: ContractModel = "fixed_price"
    onsite_ratio: float = 0  # % of person-days delivered onsite
    wbs_person_days: float = 0
    overhead_person_days: float = 0
    odc_team: list[OdcMember] = []
    odc_monthly_cost: float | None = None
    months: int | None = None
    lines: list[QuoteLine]
    phases: list[PhaseCost]
    subtotal: float
    contingency_pct: float
    contingency: float
    total: float
    total_min: float
    total_max: float
    monthly_run_cost: float | None
    milestones: list[Milestone]
    assumptions: list[str]
