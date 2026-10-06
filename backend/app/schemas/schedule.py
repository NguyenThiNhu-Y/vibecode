"""Master schedule (docs/BIDDING_SPEC.md 3.1, 4): computed from the WBS by code only."""

from datetime import date

from pydantic import BaseModel, Field

from app.schemas.common import Phase, WorkType


class ScheduleConfig(BaseModel):
    start_date: date  # default: first Monday at least 14 days from today
    headcount: dict[WorkType, int]  # default: 1 per type, AI = 2
    buffer_ratio: float = Field(default=0.15, ge=0, le=1)
    holidays: list[date] = []


class PhaseSchedule(BaseModel):
    phase: Phase
    start: date
    end: date
    working_days: int  # buffer included


class TaskSchedule(BaseModel):
    wbs_id: str  # level-2 nodes only
    start: date
    end: date


class Milestone(BaseModel):
    id: str  # "M1".."M4", stable even when a phase is missing
    name: str
    date: date
    phase: Phase
    payment_percent: int | None = None  # default payment plan (BIDDING_SPEC 4.3)


class ScheduleResult(BaseModel):
    config: ScheduleConfig
    phases: list[PhaseSchedule]
    tasks: list[TaskSchedule]
    milestones: list[Milestone]
    mermaid_gantt: str
