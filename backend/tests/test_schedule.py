"""Master schedule (docs/BIDDING_SPEC.md 4.4, task B04)."""

from datetime import date

import pytest

from app.agents.schedule import (
    DEFAULT_HEADCOUNT,
    ScheduleError,
    add_working_days,
    build_schedule,
    default_config,
    working_days_between,
)
from app.schemas.common import Phase, WorkType
from app.schemas.schedule import ScheduleConfig
from app.schemas.wbs import WbsResult

MONDAY = date(2026, 10, 12)
FRIDAY = date(2026, 10, 9)


def leaf(item_id: str, phase: str, md: float, kind: str = "BE", deps: tuple = ()) -> dict:
    return {"id": item_id, "phase": phase, "name": f"Task {item_id}", "level": 2,
            "type": kind, "estimate_md": md, "depends_on": list(deps)}  # fmt: skip


def wbs(*leaves: dict) -> WbsResult:
    groups = {}
    for item in leaves:
        group = item["id"].split(".")[0]
        groups[group] = {"id": group, "phase": item["phase"], "name": group, "level": 1}
    return WbsResult.model_validate({"items": [*groups.values(), *leaves]})


def config(start: date = MONDAY, buffer: float = 0.0, **headcount: int) -> ScheduleConfig:
    counts = {k.value: v for k, v in DEFAULT_HEADCOUNT.items()} | headcount
    return ScheduleConfig(start_date=start, headcount=counts, buffer_ratio=buffer)


def test_resource_constraint_wins_over_parallel_tasks() -> None:
    result = build_schedule(wbs(leaf("1.1", "poc", 5), leaf("1.2", "poc", 5)), config(BE=1))
    tasks = {t.wbs_id: t for t in result.tasks}
    assert tasks["1.1"].start == tasks["1.2"].start  # parallel on paper
    assert result.phases[0].working_days == 10  # but one BE does 10 MD in 10 days
    with_buffer = build_schedule(
        wbs(leaf("1.1", "poc", 5), leaf("1.2", "poc", 5)), config(buffer=0.15)
    )
    assert with_buffer.phases[0].working_days == 12  # + ceil(10 x 0.15)


def test_dependent_task_starts_after_its_dependency() -> None:
    result = build_schedule(
        wbs(leaf("1.1", "poc", 3), leaf("1.2", "poc", 2, deps=("1.1",))), config()
    )
    a, b = result.tasks
    assert b.start > a.end and b.start == date(2026, 10, 15)


def test_task_starting_friday_ends_next_monday() -> None:
    result = build_schedule(wbs(leaf("1.1", "poc", 2)), config(start=FRIDAY))
    assert (result.tasks[0].start, result.tasks[0].end) == (FRIDAY, date(2026, 10, 12))


def test_holiday_inside_task_pushes_end_by_one_day() -> None:
    plain = build_schedule(wbs(leaf("1.1", "poc", 3)), config())
    off = config()
    off.holidays = [date(2026, 10, 13)]
    shifted = build_schedule(wbs(leaf("1.1", "poc", 3)), off)
    assert plain.tasks[0].end == date(2026, 10, 14) and shifted.tasks[0].end == date(2026, 10, 15)
    assert "excludes weekends, 2026-10-13" in shifted.mermaid_gantt


def test_missing_production_drops_m4_and_moves_payment_to_m3() -> None:
    result = build_schedule(wbs(leaf("1.1", "poc", 2), leaf("2.1", "mvp", 4)), config())
    assert [(m.id, m.payment_percent) for m in result.milestones] == [
        ("M1", 30), ("M2", None), ("M3", 70),
    ]  # fmt: skip
    assert result.milestones[0].date == MONDAY
    assert result.milestones[2].date == result.phases[1].end


def test_same_input_same_schedule() -> None:
    plan = wbs(
        leaf("1.1", "poc", 4, "AI"), leaf("1.2", "poc", 3, deps=("1.1",)), leaf("2.1", "mvp", 6)
    )
    assert build_schedule(plan, config()) == build_schedule(plan, config())


def test_phases_back_to_back_and_mermaid_gantt() -> None:
    plan = wbs(leaf("1.1", "poc", 2), leaf("2.1", "mvp", 2), leaf("3.1", "production", 2))
    result = build_schedule(plan, config())
    poc, mvp, prod = result.phases
    assert add_working_days(poc.end, 1) == mvp.start and add_working_days(mvp.end, 1) == prod.start
    gantt = result.mermaid_gantt
    assert gantt.startswith("gantt") and "dateFormat YYYY-MM-DD" in gantt
    assert [line.strip() for line in gantt.splitlines() if "section" in line] == [
        "section PoC", "section MVP", "section Production",
    ]  # fmt: skip
    assert ":milestone, m4," in gantt


def test_zero_headcount_is_an_error_naming_the_type() -> None:
    with pytest.raises(ScheduleError, match="AI"):
        build_schedule(wbs(leaf("1.1", "poc", 4, "AI")), config(AI=0))


def test_more_ai_people_never_lengthen_the_schedule() -> None:
    plan = wbs(
        leaf("1.1", "mvp", 8, "AI"), leaf("1.2", "mvp", 8, "AI"), leaf("1.3", "mvp", 2, "QA")
    )
    two = build_schedule(plan, config(AI=2))
    four = build_schedule(plan, config(AI=4))
    assert four.phases[0].end <= two.phases[0].end and four.phases[0].working_days == 4


def test_calendar_helpers_and_default_start() -> None:
    assert working_days_between(FRIDAY, date(2026, 10, 12)) == 2
    assert add_working_days(date(2026, 10, 10), 0) == MONDAY  # Saturday rolls to Monday
    start = default_config(date(2026, 10, 5)).start_date
    assert start == date(2026, 10, 19) and start.weekday() == 0
    assert default_config(date(2026, 10, 6)).start_date == date(2026, 10, 26)


def _long_poc() -> WbsResult:
    """PoC of 20 parallel BE tasks x 10 MD and 3 PM tasks: 200 BE man-days, 1 BE person = 200
    days, far over the ~60-day PoC target."""
    tasks = [leaf(f"1.{n}", "poc", 10, "BE") for n in range(1, 21)]
    tasks += [leaf(f"1.{n}", "poc", 10, "PM") for n in range(21, 24)]
    return wbs(*tasks)


def test_suggested_team_fits_the_phase_target() -> None:
    from app.agents.schedule import TARGET_PHASE_DAYS, suggest_headcount

    plan, base = _long_poc(), config(buffer=0.15)
    team = suggest_headcount(plan, base)
    assert team[WorkType.BE] > 1 and team[WorkType.PM] == 1  # one PM, whatever the effort
    phase = build_schedule(plan, base.model_copy(update={"headcount": team})).phases[0]
    assert phase.working_days <= TARGET_PHASE_DAYS[Phase.POC]
    assert suggest_headcount(plan, base) == team  # deterministic


def test_small_project_keeps_the_default_team() -> None:
    from app.agents.schedule import suggest_headcount

    small = wbs(leaf("1.1", "poc", 5, "BE"), leaf("1.2", "poc", 2, "PM"))
    assert suggest_headcount(small, config()) == {k: v for k, v in config().headcount.items()}


def test_no_person_added_for_a_marginal_gain() -> None:
    """A single 10-MD dependency chain cannot be shortened below its length by more people of
    another type, so nobody is added for it."""
    from app.agents.schedule import suggest_headcount

    chain = wbs(
        *[leaf(f"1.{n}", "poc", 10, "PM", (f"1.{n - 1}",) if n > 1 else ()) for n in range(1, 9)]
    )
    assert suggest_headcount(chain, config())[WorkType.PM] == 1  # PM capped at 1; no other help
