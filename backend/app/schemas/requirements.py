from typing import Literal

from pydantic import BaseModel

Coverage = Literal["full", "partial", "not_supported", "needs_clarification"]


class RequirementAssessment(BaseModel):
    req_id: str
    coverage: Coverage
    component: str | None = None  # architecture component that covers it
    note: str  # Vietnamese, 1 sentence


class RequirementMatrix(BaseModel):
    items: list[RequirementAssessment]
    skipped: bool = False  # True when the run has no requirement file
