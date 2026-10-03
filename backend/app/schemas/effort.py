from pydantic import BaseModel

from app.schemas.common import Phase, SolutionPattern


class Multiplier(BaseModel):
    key: str  # on_prem | japanese_language | low_data_readiness | strict_compliance
    label: str  # Vietnamese, shown in the UI
    factor: float


class EffortBasis(BaseModel):
    """How computed_estimates were derived: base[pattern] x stacked multipliers (pure code)."""

    pattern: SolutionPattern
    base: dict[Phase, list[int]]
    multipliers: list[Multiplier]
    factor: float
    computed: dict[Phase, list[int]]
