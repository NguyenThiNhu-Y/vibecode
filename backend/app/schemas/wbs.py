from pydantic import BaseModel, Field

from app.schemas.common import Phase


class WBSTask(BaseModel):
    id: str  # "W1", "W2", ...
    phase: Phase
    name: str
    role: str
    person_days: int = Field(ge=1, le=200)
    depends_on: list[str] = []
    deliverable: str | None = None


class WBSResult(BaseModel):
    tasks: list[WBSTask] = Field(min_length=1, max_length=60)
    notes: list[str] = []


class ScheduledTask(BaseModel):
    id: str
    start_day: int  # working day offset from project start (0-based)
    end_day: int  # exclusive


class Schedule(BaseModel):
    """Computed by code from the WBS (app/agents/schedule.py), never by the LLM."""

    tasks: list[ScheduledTask]
    phases: dict[Phase, list[int]]  # phase -> [start_day, end_day]
    total_days: int
