import json

import pytest

from app.agents.schedule import compute_schedule, find_cycle
from app.agents.steps import make_requirements_validator, make_wbs_validator
from app.llm.mock_generators import generate_requirements, generate_wbs
from app.schemas.architecture import ArchitectureResult
from app.schemas.requirements import RequirementMatrix
from app.schemas.wbs import WBSResult
from tests.conftest import load_fixture

ESTIMATES = ArchitectureResult.model_validate(
    load_fixture("architecture")
).estimates  # 10–15/30–50/60–100


def task(tid, phase, days, deps=()):
    return {
        "id": tid,
        "phase": phase,
        "name": tid,
        "role": "Dev",
        "person_days": days,
        "depends_on": list(deps),
    }


def wbs(*tasks) -> WBSResult:
    return WBSResult.model_validate({"tasks": list(tasks)})


def valid_wbs() -> WBSResult:
    return wbs(
        task("W1", "poc", 6), task("W2", "poc", 6, ["W1"]),
        task("W3", "mvp", 20, ["W2"]), task("W4", "mvp", 20, ["W2"]),
        task("W5", "production", 40, ["W3", "W4"]), task("W6", "production", 40, ["W5"]),
    )  # fmt: skip


def test_schedule_runs_phases_in_order_and_parallelizes() -> None:
    sched = compute_schedule(valid_wbs())
    by_id = {t.id: (t.start_day, t.end_day) for t in sched.tasks}
    assert by_id["W1"] == (0, 6) and by_id["W2"] == (6, 12)
    assert by_id["W3"] == (12, 32) and by_id["W4"] == (12, 32)  # parallel
    assert by_id["W6"] == (72, 112)
    assert sched.phases["mvp"] == [12, 32] and sched.total_days == 112


def test_same_phase_dependency_declared_out_of_order() -> None:
    sched = compute_schedule(wbs(task("W2", "poc", 3, ["W1"]), task("W1", "poc", 2)))
    assert {t.id: t.start_day for t in sched.tasks} == {"W2": 2, "W1": 0}


def test_wbs_validator_accepts_matching_sums() -> None:
    assert make_wbs_validator(ESTIMATES)(valid_wbs())


@pytest.mark.parametrize(
    ("result", "message"),
    [
        (
            wbs(task("W1", "poc", 3), task("W2", "mvp", 40), task("W3", "production", 80)),
            "phase poc = 3",
        ),
        (wbs(task("W1", "poc", 12, ["W9"])), "không tồn tại"),
        (wbs(task("W1", "poc", 12, ["W2"]), task("W2", "mvp", 40)), "giai đoạn sau"),
        (wbs(task("W1", "poc", 6, ["W2"]), task("W2", "poc", 6, ["W1"])), "phụ thuộc vòng"),
        (wbs(task("W1", "poc", 6), task("W1", "poc", 6)), "trùng"),
    ],
)
def test_wbs_validator_rejects(result: WBSResult, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        make_wbs_validator(ESTIMATES)(result)


def test_find_cycle() -> None:
    assert find_cycle(valid_wbs()) is None
    assert find_cycle(wbs(task("A", "poc", 1, ["B"]), task("B", "poc", 1, ["A"])))


def test_requirements_validator_checks_coverage_and_orders() -> None:
    validate = make_requirements_validator(["R1", "R2"])
    ok = RequirementMatrix.model_validate(
        {
            "items": [
                {"req_id": "R2", "coverage": "full", "note": "x"},
                {"req_id": "R1", "coverage": "partial", "note": "y"},
            ]
        }
    )
    assert [i.req_id for i in validate(ok).items] == ["R1", "R2"]
    missing = RequirementMatrix.model_validate(
        {"items": [{"req_id": "R1", "coverage": "full", "note": "x"}]}
    )
    with pytest.raises(ValueError, match="Thiếu: \\['R2'\\]"):
        validate(missing)


def test_mock_generators_produce_valid_outputs() -> None:
    arch = load_fixture("architecture")
    out = WBSResult.model_validate_json(
        generate_wbs(json.dumps({"architecture": arch}, ensure_ascii=False))
    )
    assert make_wbs_validator(ESTIMATES)(out)
    reqs = [
        {"id": "R1", "text": "Tích hợp SSO hiện có của công ty"},
        {"id": "R2", "text": "Dùng AI"},
    ]
    matrix = RequirementMatrix.model_validate_json(
        generate_requirements(
            json.dumps({"requirements": reqs, "architecture": arch}, ensure_ascii=False)
        )
    )
    assert make_requirements_validator(["R1", "R2"])(matrix)
    assert [i.coverage for i in matrix.items] == ["partial", "needs_clarification"]
