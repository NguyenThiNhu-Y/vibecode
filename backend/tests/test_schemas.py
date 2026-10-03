import pytest
from pydantic import ValidationError

from app.schemas.architecture import ArchitectureResult
from app.schemas.feasibility import FeasibilityResult
from app.schemas.gaps import GapResult
from app.schemas.intake import IntakeResult
from app.schemas.pattern import PatternResult
from app.schemas.proposal import ProposalResult
from tests.conftest import load_fixture

MODELS = {
    "intake": IntakeResult,
    "gaps": GapResult,
    "pattern": PatternResult,
    "feasibility": FeasibilityResult,
    "architecture": ArchitectureResult,
    "proposal": ProposalResult,
}


@pytest.mark.parametrize("step", list(MODELS))
def test_valid_fixtures(step: str) -> None:
    MODELS[step].model_validate(load_fixture(step))


def test_rejects_severity_out_of_range() -> None:
    data = load_fixture("feasibility")
    data["risks"][0]["severity"] = 7
    with pytest.raises(ValidationError):
        FeasibilityResult.model_validate(data)


def test_rejects_unknown_pattern() -> None:
    data = load_fixture("pattern")
    data["pattern"] = "magic"
    with pytest.raises(ValidationError):
        PatternResult.model_validate(data)


def test_rejects_more_than_seven_questions() -> None:
    data = load_fixture("gaps")
    question = data["questions"][0]
    data["questions"] = [{**question, "id": f"q{i}"} for i in range(1, 9)]
    with pytest.raises(ValidationError):
        GapResult.model_validate(data)


def test_rejects_unsupported_language() -> None:
    data = load_fixture("intake")
    data["language"] = "fr"
    with pytest.raises(ValidationError):
        IntakeResult.model_validate(data)
