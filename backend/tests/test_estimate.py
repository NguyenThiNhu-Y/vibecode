from pathlib import Path

import pytest

from app.agents.estimate import compute_estimates, explain_estimates
from app.schemas.common import Phase
from app.schemas.feasibility import FeasibilityResult
from app.schemas.intake import IntakeResult
from app.schemas.pattern import PatternResult
from tests.conftest import load_fixture

TEMPLATE = """
unit: person_days
base:
  rag: { poc: [10, 15], mvp: [30, 50], production: [60, 100] }
multipliers:
  on_prem: 1.3
  japanese_language: 1.15
  low_data_readiness: 1.4
  strict_compliance: 1.2
"""


@pytest.fixture
def template(tmp_path: Path) -> Path:
    path = tmp_path / "estimation_template.yaml"
    path.write_text(TEMPLATE, encoding="utf-8")
    return path


def models(pattern: str = "rag", language: str = "vi", constraints=(), readiness: int = 4):
    p = PatternResult.model_validate({**load_fixture("pattern"), "pattern": pattern})
    i = IntakeResult.model_validate(
        {**load_fixture("intake"), "language": language, "constraints": list(constraints)}
    )
    f = FeasibilityResult.model_validate(
        {**load_fixture("feasibility"), "data_readiness": readiness}
    )
    return p, i, f


def test_rag_cloud_vietnamese_equals_base(template: Path) -> None:
    result = compute_estimates(*models(), template_path=template)
    assert result == {Phase.POC: (10, 15), Phase.MVP: (30, 50), Phase.PRODUCTION: (60, 100)}


def test_rag_on_prem_japanese_multiplies(template: Path) -> None:
    result = compute_estimates(
        *models(language="ja", constraints=["on_prem"]), template_path=template
    )
    m = 1.3 * 1.15
    assert result[Phase.POC] == (round(10 * m), round(15 * m))
    assert result[Phase.MVP] == (round(30 * m), round(50 * m))
    assert result[Phase.PRODUCTION] == (round(60 * m), round(100 * m))


def test_all_multipliers_stack(template: Path) -> None:
    result = compute_estimates(
        *models(language="ja", constraints=["On-Prem", "strict_compliance"], readiness=2),
        template_path=template,
    )
    m = 1.3 * 1.15 * 1.4 * 1.2
    assert result[Phase.MVP] == (round(30 * m), round(50 * m))


def test_needs_clarification_returns_empty(template: Path) -> None:
    assert compute_estimates(*models(pattern="needs_clarification"), template_path=template) == {}


def test_pattern_missing_from_base_returns_empty(template: Path) -> None:
    assert compute_estimates(*models(pattern="agent"), template_path=template) == {}


def test_real_template_has_every_pattern() -> None:
    for pattern in ["rag", "agent", "classic_ml", "fine_tune", "no_ai_rule_based"]:
        assert compute_estimates(*models(pattern=pattern)) != {}


def test_explain_estimates_lists_applied_multipliers(template: Path) -> None:
    basis = explain_estimates(
        *models(language="ja", constraints=["on_prem"]), template_path=template
    )
    assert basis is not None
    assert [m.key for m in basis.multipliers] == ["on_prem", "japanese_language"]
    assert basis.factor == round(1.3 * 1.15, 4)
    assert basis.base[Phase.MVP] == [30, 50]
    assert basis.computed[Phase.MVP] == [round(30 * 1.3 * 1.15), round(50 * 1.3 * 1.15)]


def test_explain_estimates_none_for_needs_clarification(template: Path) -> None:
    assert explain_estimates(*models(pattern="needs_clarification"), template_path=template) is None
