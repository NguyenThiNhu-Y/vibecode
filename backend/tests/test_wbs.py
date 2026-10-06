"""Bước wbs (docs/BIDDING_SPEC.md 2.1, task B03) và bảng đáp ứng yêu cầu."""

import json

import pytest
from pydantic import ValidationError

from app.agents.steps import make_requirements_validator, make_wbs_validator
from app.llm.mock_generators import generate_requirements, generate_wbs
from app.schemas.common import Phase, SolutionPattern
from app.schemas.requirements import RequirementMatrix
from app.schemas.wbs import WbsResult
from tests.conftest import load_fixture

COMPUTED = {Phase.POC: (10, 15), Phase.MVP: (30, 50)}
PHASES = [Phase.POC, Phase.MVP]


def node(item_id: str, phase: str, md: float | None = None, kind: str | None = "BE", **extra):
    item = {
        "id": item_id,
        "phase": phase,
        "name": f"Task {item_id}",
        "level": item_id.count(".") + 1,
    }
    if md is not None:
        item |= {"type": kind, "estimate_md": md}
    return item | extra


def items() -> list[dict]:
    return [
        node("1", "poc"),
        node("1.1", "poc", 2, "PM"),
        node("1.2", "poc", 4, "DATA", tags=["data_prep"]),
        node("1.3", "poc"),
        node("1.3.1", "poc", 3, "AI"),
        node("1.3.2", "poc", 2, "AI", tags=["evaluation"], depends_on=["1.3.1"]),
        node("1.4", "poc", 2, "QA", depends_on=["1.3"]),
        node("2", "mvp"),
        node("2.1", "mvp", 4, "PM"),
        node("2.2", "mvp", 10, "BE", depends_on=["1.4"]),
        node("2.3", "mvp", 10, "BE", depends_on=["2.2"]),
        node("2.4", "mvp", 8, "AI"),
        node("2.5", "mvp", 6, "QA", depends_on=["2.3", "2.4"]),
    ]  # poc 13 MD, mvp 38 MD


def wbs(raw: list[dict], **extra) -> WbsResult:
    return WbsResult.model_validate({"items": raw, **extra})


def validate(result: WbsResult, pattern: SolutionPattern = SolutionPattern.RAG) -> WbsResult:
    return make_wbs_validator(pattern, COMPUTED, PHASES)(result)


def without(raw: list[dict], *ids: str) -> list[dict]:
    return [i for i in raw if i["id"] not in ids]


def test_valid_wbs_and_parent_sums_recomputed_by_code() -> None:
    raw = items()
    raw[3]["estimate_md"] = 9  # the LLM wrote a wrong parent total: code overwrites it
    result = validate(wbs(raw))
    by_id = {i.id: i for i in result.items}
    assert by_id["1.3"].estimate_md == 5 and by_id["1"].estimate_md == 13
    totals = {t.phase: t for t in result.totals}
    assert totals[Phase.POC].total_md == 13 and totals[Phase.MVP].total_md == 38
    assert totals[Phase.MVP].by_type == {"PM": 4, "BE": 20, "AI": 8, "QA": 6}


def test_leaf_estimate_over_10_rejected_by_schema() -> None:
    raw = items()
    raw[1]["estimate_md"] = 11
    with pytest.raises(ValidationError):
        wbs(raw)


def _with(raw: list[dict], item_id: str, **change) -> list[dict]:
    return [i | change if i["id"] == item_id else i for i in raw]


@pytest.mark.parametrize(
    ("raw", "message"),
    [
        (items() + [node("1.1", "poc", 1, "PM")], "bị trùng"),
        (_with(items(), "2.2", depends_on=["9.9"]), "không tồn tại"),
        (_with(items(), "2.2", depends_on=["2.3"]), "phụ thuộc vòng"),
        (_with(items(), "1.2", depends_on=["2.1"]), "giai đoạn sau"),
        (_with(items(), "1.4", type="BE"), r"thiếu task loại \['QA'\]"),
        (_with(items(), "1.3.2", tags=[]), r"tag \['evaluation'\]"),
        (without(items(), "1.3", "1.3.1", "1.3.2") + [node("1.3.1", "poc", 5, "AI")],
         "không có node cha"),
        (_with(items(), "1.2", level=3), "level phải là 2"),
        (items() + [node("3", "production"), node("3.1", "production"),
                    node("3.1.1", "production", 2, "QA")], "production chỉ có task mức tổng"),
        (items() + [node("3", "production"), node("3.1", "production", 2, "PM")], "thừa"),
        (_with(_with(items(), "2.2", estimate_md=1), "2.3", estimate_md=1), "ngoài khoảng"),
    ],
)  # fmt: skip
def test_wbs_validator_rejects(raw: list[dict], message: str) -> None:
    with pytest.raises(ValueError, match=message):
        validate(wbs(raw))


def test_total_off_range_accepted_with_adjustment_note() -> None:
    raw = _with(items(), "2.4", estimate_md=0)  # mvp 30 -> fine; push it below 24
    raw = _with(raw, "2.2", estimate_md=2)
    note = [{"phase": "mvp", "total_md": 0, "by_type": {}, "adjustment_note": "Khách đã có API"}]
    result = validate(wbs(raw, totals=note))
    mvp = next(t for t in result.totals if t.phase == Phase.MVP)
    assert mvp.total_md == 22 and mvp.adjustment_note == "Khách đã có API"


def test_no_ai_pattern_needs_no_data_prep_or_evaluation() -> None:
    raw = _with(_with(items(), "1.2", tags=[]), "1.3.2", tags=[])
    assert validate(wbs(raw), SolutionPattern.NO_AI_RULE_BASED)
    with pytest.raises(ValueError, match="data_prep"):
        validate(wbs(raw))


def test_legacy_flat_wbs_is_converted() -> None:
    legacy = {
        "tasks": [
            {"id": "W1", "phase": "poc", "name": "Khảo sát", "role": "BA", "person_days": 4},
            {"id": "W2", "phase": "poc", "name": "Prototype", "role": "AI engineer",
             "person_days": 15, "depends_on": ["W1"]},
        ],
        "notes": ["ghi chú cũ"],
    }  # fmt: skip
    result = WbsResult.model_validate(legacy)
    by_id = {i.id: i for i in result.items}
    assert by_id["1.1"].type.value == "BA" and by_id["1.2"].depends_on == ["1.1"]
    assert [by_id["1.2.1"].estimate_md, by_id["1.2.2"].estimate_md] == [10, 5]
    assert by_id["1.2"].estimate_md == 15 and result.totals[0].total_md == 19
    assert result.assumptions == ["ghi chú cũ"]


def test_requirements_validator_checks_coverage_and_orders() -> None:
    check = make_requirements_validator(["R1", "R2"])
    ok = RequirementMatrix.model_validate(
        {
            "items": [
                {"req_id": "R2", "coverage": "full", "note": "x"},
                {"req_id": "R1", "coverage": "partial", "note": "y"},
            ]
        }
    )
    assert [i.req_id for i in check(ok).items] == ["R1", "R2"]
    missing = RequirementMatrix.model_validate(
        {"items": [{"req_id": "R1", "coverage": "full", "note": "x"}]}
    )
    with pytest.raises(ValueError, match="Thiếu: \\['R2'\\]"):
        check(missing)


@pytest.mark.parametrize("pattern", ["rag", "no_ai_rule_based"])
def test_mock_generators_produce_valid_outputs(pattern: str) -> None:
    arch = load_fixture("architecture")
    computed = {"poc": [13, 20], "mvp": [39, 65], "production": [78, 130]}
    context = {
        "architecture": arch,
        "pattern": {"pattern": pattern},
        "computed_estimates": computed,
    }
    out = WbsResult.model_validate_json(generate_wbs(json.dumps(context, ensure_ascii=False)))
    phases = [Phase(e["phase"]) for e in arch["estimates"]]
    ranges = {Phase(k): (v[0], v[1]) for k, v in computed.items()}
    assert make_wbs_validator(SolutionPattern(pattern), ranges, phases)(out)
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
