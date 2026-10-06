"""Master schedule from the WBS, computed by code only (docs/BIDDING_SPEC.md 4).

Phases run poc -> mvp -> production back to back. A level-2 task lasts
ceil(max over type (man-days of that type / headcount of that type)) working days and starts
once its dependencies (lifted from sub-tasks to their task) are done. A phase lasts
max(critical path, total man-days per type / headcount) plus a buffer. This is a preliminary
estimate: parallel tasks are not levelled day by day.
"""

import math
from datetime import date, timedelta

from app.schemas.common import Phase, WorkType
from app.schemas.schedule import (
    Milestone,
    PhaseSchedule,
    ScheduleConfig,
    ScheduleResult,
    TaskSchedule,
)
from app.schemas.wbs import PHASE_ORDER, WbsResult, id_key, leaves, task_of

DEFAULT_HEADCOUNT: dict[WorkType, int] = {t: 1 for t in WorkType} | {WorkType.AI: 2}
PHASE_NAMES = {Phase.POC: "PoC", Phase.MVP: "MVP", Phase.PRODUCTION: "Production"}
# id, name, phase whose end it marks (None = project start), default payment %
MILESTONES: list[tuple[str, str, Phase | None, int | None]] = [
    ("M1", "Kick-off", None, 30),
    ("M2", "Nghiệm thu PoC", Phase.POC, None),
    ("M3", "Nghiệm thu MVP", Phase.MVP, 40),
    ("M4", "Go-live", Phase.PRODUCTION, 30),
]


class ScheduleError(ValueError):
    pass


def default_config(today: date | None = None) -> ScheduleConfig:
    """Start on the first Monday at least 14 days from today."""
    start = (today or date.today()) + timedelta(days=14)
    start += timedelta(days=(7 - start.weekday()) % 7)
    return ScheduleConfig(start_date=start, headcount=dict(DEFAULT_HEADCOUNT))


# ---------- working-day calendar (Mon–Fri minus holidays) ----------
def _working(d: date, holidays: set[date]) -> bool:
    return d.weekday() < 5 and d not in holidays


def _next_working(d: date, holidays: set[date]) -> date:
    while not _working(d, holidays):
        d += timedelta(days=1)
    return d


def add_working_days(d: date, n: int, holidays: set[date] | None = None) -> date:
    """The working day n working days after d (d itself, moved to a working day, when n = 0)."""
    off = holidays or set()
    d = _next_working(d, off)
    for _ in range(n):
        d = _next_working(d + timedelta(days=1), off)
    return d


def working_days_between(a: date, b: date, holidays: set[date] | None = None) -> int:
    """Working days from a to b, both included."""
    off = holidays or set()
    return sum(1 for k in range((b - a).days + 1) if _working(a + timedelta(days=k), off))


# ---------- dependencies ----------
def _level2(wbs: WbsResult) -> list[str]:
    return sorted((i.id for i in wbs.items if i.level == 2), key=id_key)


def lifted_dependencies(wbs: WbsResult) -> dict[str, set[str]]:
    """Dependencies between level-2 tasks: sub-task links are lifted to their task, a link to a
    level-1 group means every task of that group. Self-links are dropped."""
    tasks = _level2(wbs)
    under = {
        g.id: [t for t in tasks if t.startswith(g.id + ".")] for g in wbs.items if g.level == 1
    }
    preds: dict[str, set[str]] = {t: set() for t in tasks}
    for item in wbs.items:
        sources = under.get(item.id, []) if item.level == 1 else [task_of(item.id)]
        for dep in item.depends_on:
            targets = under.get(dep, []) if dep in under else [task_of(dep)]
            for src in sources:
                preds.setdefault(src, set()).update(t for t in targets if t != src and t in preds)
    return preds


def find_cycle(edges: dict[str, list[str]] | dict[str, set[str]]) -> list[str] | None:
    state: dict[str, int] = {}  # 1 = visiting, 2 = done

    def visit(node: str, path: list[str]) -> list[str] | None:
        if state.get(node) == 1:
            return path[path.index(node) :] + [node]
        if state.get(node) == 2 or node not in edges:
            return None
        state[node] = 1
        for dep in sorted(edges[node], key=id_key):
            if cycle := visit(dep, path + [node]):
                return cycle
        state[node] = 2
        return None

    for node in sorted(edges, key=id_key):
        if cycle := visit(node, []):
            return cycle
    return None


# ---------- schedule ----------
def _md_by_type(wbs: WbsResult) -> dict[str, dict[WorkType, float]]:
    per_task: dict[str, dict[WorkType, float]] = {}
    for leaf in leaves(wbs):
        if leaf.type is None or leaf.level < 2:
            continue
        by_type = per_task.setdefault(task_of(leaf.id), {})
        by_type[leaf.type] = by_type.get(leaf.type, 0) + (leaf.estimate_md or 0)
    return per_task


def _days(md: dict[WorkType, float], headcount: dict[WorkType, int]) -> int:
    return max([1] + [math.ceil(round(v / headcount[t], 6)) for t, v in md.items() if v > 0])


def _offsets(
    ids: list[str], preds: dict[str, set[str]], durations: dict[str, int]
) -> tuple[dict[str, int], dict[str, int]]:
    """Working-day offsets inside a phase: a task starts the day after its latest predecessor
    ends (dependencies on earlier phases are already satisfied, so they are not in preds)."""
    start: dict[str, int] = {}
    end: dict[str, int] = {}

    def finish(tid: str) -> int:
        if tid not in end:
            start[tid] = max([0] + [finish(p) + 1 for p in sorted(preds[tid], key=id_key)])
            end[tid] = start[tid] + durations[tid] - 1
        return end[tid]

    for tid in ids:
        finish(tid)
    return start, end


def build_schedule(wbs: WbsResult, config: ScheduleConfig) -> ScheduleResult:
    holidays = set(config.holidays)
    without = sorted(
        {
            leaf.type.value
            for leaf in leaves(wbs)
            if leaf.type and config.headcount.get(leaf.type, 0) < 1
        }
    )
    if without:
        raise ScheduleError(
            f"Chưa có người cho loại công việc {', '.join(without)}: đặt số người ≥ 1 để tính lịch."
        )
    md = _md_by_type(wbs)
    preds = lifted_dependencies(wbs)
    if cycle := find_cycle(preds):
        raise ScheduleError(f"WBS có phụ thuộc vòng giữa các task: {' -> '.join(cycle)}")
    phase_of = {i.id: i.phase for i in wbs.items}

    phases: list[PhaseSchedule] = []
    tasks: list[TaskSchedule] = []
    cursor = config.start_date
    for phase in PHASE_ORDER:
        ids = [t for t in _level2(wbs) if phase_of[t] == phase]
        if not ids:
            continue
        durations = {t: _days(md.get(t, {}), config.headcount) for t in ids}
        same_phase = {t: {p for p in preds.get(t, ()) if p in durations} for t in ids}
        start_off, end_off = _offsets(ids, same_phase, durations)
        critical = max(end_off.values()) + 1
        phase_md: dict[WorkType, float] = {}
        for tid in ids:
            for kind, value in md.get(tid, {}).items():
                phase_md[kind] = phase_md.get(kind, 0) + value
        length = max(critical, _days(phase_md, config.headcount))
        working = length + math.ceil(round(length * config.buffer_ratio, 6))
        start = add_working_days(cursor, 0, holidays)
        end = add_working_days(start, working - 1, holidays)
        phases.append(PhaseSchedule(phase=phase, start=start, end=end, working_days=working))
        for tid in ids:
            tasks.append(
                TaskSchedule(
                    wbs_id=tid,
                    start=add_working_days(start, start_off[tid], holidays),
                    end=add_working_days(start, end_off[tid], holidays),
                )
            )
        cursor = end + timedelta(days=1)
    if not phases:
        raise ScheduleError("WBS chưa có task cấp 2 nào để lập lịch.")
    milestones = _milestones(phases)
    return ScheduleResult(
        config=config,
        phases=phases,
        tasks=tasks,
        milestones=milestones,
        mermaid_gantt=_mermaid(wbs, phases, tasks, milestones, config),
    )


def _milestones(phases: list[PhaseSchedule]) -> list[Milestone]:
    """Default milestones; a missing phase drops its milestone and its payment % moves to the
    next milestone (or the last one when nothing follows)."""
    ends = {p.phase: p.end for p in phases}
    out: list[Milestone] = []
    pending = 0
    for mid, name, phase, percent in MILESTONES:
        if phase is not None and phase not in ends:
            pending += percent or 0
            continue
        share = (percent or 0) + pending
        pending = 0
        out.append(
            Milestone(
                id=mid,
                name=name,
                date=ends[phase] if phase else phases[0].start,
                phase=phase or phases[0].phase,
                payment_percent=share or None,
            )
        )
    if pending:
        last = out[-1]
        last.payment_percent = (last.payment_percent or 0) + pending
    return out


def _label(text: str) -> str:
    """Mermaid gantt task text cannot contain ':' ';' '#' or line breaks."""
    clean = " ".join(text.replace(":", " ").replace(";", ",").replace("#", "").split())
    return clean[:60] or "Task"


def _mermaid(
    wbs: WbsResult,
    phases: list[PhaseSchedule],
    tasks: list[TaskSchedule],
    milestones: list[Milestone],
    config: ScheduleConfig,
) -> str:
    names = {i.id: i.name for i in wbs.items}
    excludes = ", ".join(["weekends"] + [d.isoformat() for d in sorted(config.holidays)])
    lines = [
        "gantt",
        "    title Master schedule",
        "    dateFormat YYYY-MM-DD",
        "    axisFormat %d/%m",
        f"    excludes {excludes}",
    ]
    by_phase = {i.id: i.phase for i in wbs.items}
    for p in phases:
        lines.append(f"    section {PHASE_NAMES[p.phase]}")
        for t in tasks:
            if by_phase[t.wbs_id] != p.phase:
                continue
            ref = "t" + t.wbs_id.replace(".", "_")
            # Mermaid's end date is exclusive: one day after the last working day
            lines.append(
                f"    {_label(f'{t.wbs_id} {names[t.wbs_id]}')} :{ref}, {t.start.isoformat()}, "
                f"{(t.end + timedelta(days=1)).isoformat()}"
            )
        for m in milestones:
            if m.phase == p.phase:
                lines.append(
                    f"    {_label(m.name)} :milestone, {m.id.lower()}, {m.date.isoformat()}, 0d"
                )
    return "\n".join(lines)


def total_working_days(schedule: ScheduleResult | None) -> int:
    return sum(p.working_days for p in schedule.phases) if schedule else 0
