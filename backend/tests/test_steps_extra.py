from app.agents.steps import make_architecture_validator
from app.schemas.architecture import ArchitectureResult
from tests.conftest import load_fixture


def _arch(mermaid: str | None) -> ArchitectureResult:
    return ArchitectureResult.model_validate({**load_fixture("architecture"), "mermaid": mermaid})


def test_mermaid_fence_is_stripped_and_invalid_dropped() -> None:
    validate = make_architecture_validator({})
    fenced = validate(_arch("```mermaid\nflowchart LR\n  A --> B\n```"))
    assert fenced.mermaid == "flowchart LR\n  A --> B"
    assert validate(_arch("sequenceDiagram\n A->>B: hi")).mermaid is None
    assert validate(_arch(None)).mermaid is None
