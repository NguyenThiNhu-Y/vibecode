"""Timeline from the WBS, computed by code (never by the LLM).

Rules: phases run in order poc -> mvp -> production; inside a phase a task starts when the
phase starts and all its dependencies are finished; each task is done by one person, so its
duration in working days equals its person-days. Tasks without dependencies run in parallel.
"""

from app.schemas.common import Phase
from app.schemas.wbs import Schedule, ScheduledTask, WBSResult

PHASE_ORDER = [Phase.POC, Phase.MVP, Phase.PRODUCTION]


def find_cycle(wbs: WBSResult) -> list[str] | None:
    deps = {t.id: t.depends_on for t in wbs.tasks}
    state: dict[str, int] = {}  # 1 = visiting, 2 = done

    def visit(node: str, path: list[str]) -> list[str] | None:
        if state.get(node) == 1:
            return path[path.index(node) :] + [node]
        if state.get(node) == 2 or node not in deps:
            return None
        state[node] = 1
        for dep in deps[node]:
            if cycle := visit(dep, path + [node]):
                return cycle
        state[node] = 2
        return None

    for task_id in deps:
        if cycle := visit(task_id, []):
            return cycle
    return None


def compute_schedule(wbs: WBSResult) -> Schedule:
    by_id = {t.id: t for t in wbs.tasks}
    phase_start: dict[Phase, int] = {}
    start: dict[str, int] = {}
    end: dict[str, int] = {}

    def finish(task_id: str) -> int:
        if task_id not in end:
            task = by_id[task_id]
            ready = max(
                [phase_start[task.phase]] + [finish(d) for d in task.depends_on if d in by_id]
            )
            start[task_id] = ready
            end[task_id] = ready + task.person_days
        return end[task_id]

    phases: dict[Phase, list[int]] = {}
    cursor = 0
    for phase in PHASE_ORDER:
        ids = [t.id for t in wbs.tasks if t.phase == phase]
        if not ids:
            continue
        phase_start[phase] = cursor
        phase_end = max(finish(i) for i in ids)
        phases[phase] = [cursor, phase_end]
        cursor = phase_end
    return Schedule(
        tasks=[ScheduledTask(id=t.id, start_day=start[t.id], end_day=end[t.id]) for t in wbs.tasks],
        phases=phases,
        total_days=cursor,
    )
