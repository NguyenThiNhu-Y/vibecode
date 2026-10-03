from pydantic import BaseModel

from app.schemas.common import Confidence, SolutionPattern


class RejectedOption(BaseModel):
    pattern: SolutionPattern
    reason: str


class PatternResult(BaseModel):
    pattern: SolutionPattern
    rationale: str
    rejected: list[RejectedOption]
    confidence: Confidence
    assumptions: list[str] = []
