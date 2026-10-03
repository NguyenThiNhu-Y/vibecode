from pydantic import BaseModel, Field

from app.schemas.common import Deployment, Phase


class Component(BaseModel):
    name: str
    purpose: str
    tech_options: list[str]


class PhaseEstimate(BaseModel):
    phase: Phase
    min_person_days: int = Field(ge=0)
    max_person_days: int = Field(ge=0)
    team: list[str]
    deliverables: list[str]
    adjustment_note: str | None = None  # reason when deviating from computed_estimates


class ArchitectureResult(BaseModel):
    components: list[Component]
    deployment: Deployment
    estimates: list[PhaseEstimate]
    reference_projects: list[str] = []
    mermaid: str | None = None
