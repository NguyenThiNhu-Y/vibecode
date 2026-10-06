"""WBS + master schedule as the exports read them: one row per level-2 task, with man-days rolled
up from its leaves, its work types and its dates / week numbers from the project start."""

from dataclasses import dataclass
from datetime import date, timedelta

from app.agents.schedule import ScheduleError, build_schedule, default_config
from app.schemas.common import Phase
from app.schemas.run import ScopingRun
from app.schemas.schedule import ScheduleResult
from app.schemas.wbs import id_key, leaves, ordered, task_of


@dataclass
class TaskRow:
    id: str
    phase: Phase
    name: str
    md: float
    types: list[str]  # work types of its leaves, most man-days first
    depends_on: list[str]
    start: date | None = None
    end: date | None = None
    week_from: int | None = None  # 1-based week of the project
    week_to: int | None = None


def schedule_for(run: ScopingRun) -> ScheduleResult | None:
    """The run's schedule; runs saved before the bidding extension get one computed on the fly."""
    if run.schedule or not run.wbs:
        return run.schedule
    try:
        return build_schedule(run.wbs, run.schedule_config or default_config())
    except ScheduleError:
        return None


def monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def week_starts(schedule: ScheduleResult) -> list[date]:
    """Monday of every week from the project start to its end (milestones included)."""
    first = min(p.start for p in schedule.phases)
    last = max([p.end for p in schedule.phases] + [m.date for m in schedule.milestones])
    weeks = (monday(last) - monday(first)).days // 7 + 1
    return [monday(first) + timedelta(weeks=w) for w in range(weeks)]


def week_of(schedule: ScheduleResult, d: date) -> int:
    """1-based project week of a date."""
    return (monday(d) - monday(min(p.start for p in schedule.phases))).days // 7 + 1


def task_rows(run: ScopingRun) -> list[TaskRow]:
    if not run.wbs:
        return []
    schedule = schedule_for(run)
    dates = {t.wbs_id: t for t in schedule.tasks} if schedule else {}
    by_task: dict[str, dict[str, float]] = {}
    for leaf in leaves(run.wbs):
        if leaf.type is not None:
            types = by_task.setdefault(task_of(leaf.id), {})
            types[leaf.type.value] = types.get(leaf.type.value, 0) + (leaf.estimate_md or 0)
    rows = []
    for item in ordered(run.wbs):
        if item.level != 2:
            continue
        lifted = sorted({task_of(d) for d in item.depends_on} - {item.id}, key=id_key)
        types = by_task.get(item.id, {})
        row = TaskRow(
            id=item.id,
            phase=item.phase,
            name=item.name,
            md=item.estimate_md or 0,
            types=sorted(types, key=lambda t: -types[t]),
            depends_on=lifted,
        )
        if schedule and item.id in dates:
            row.start, row.end = dates[item.id].start, dates[item.id].end
            row.week_from, row.week_to = week_of(schedule, row.start), week_of(schedule, row.end)
        rows.append(row)
    return rows


def total_md(run: ScopingRun) -> float:
    return round(sum(t.total_md for t in run.wbs.totals), 2) if run.wbs else 0.0
