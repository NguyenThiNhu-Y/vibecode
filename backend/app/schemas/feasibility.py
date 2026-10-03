from pydantic import BaseModel, Field

from app.schemas.common import GoRecommendation, RiskCategory


class RiskItem(BaseModel):
    category: RiskCategory
    description: str
    severity: int = Field(ge=1, le=5)
    mitigation: str


class FeasibilityResult(BaseModel):
    data_readiness: int = Field(ge=1, le=5)
    technical_feasibility: int = Field(ge=1, le=5)
    business_value: int = Field(ge=1, le=5)
    risks: list[RiskItem]
    go_recommendation: GoRecommendation
