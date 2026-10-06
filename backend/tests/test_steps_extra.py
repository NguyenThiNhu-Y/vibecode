import pytest

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


def test_proposal_headings_accepted_in_customer_language() -> None:
    from app.agents.steps import validate_proposal
    from app.schemas.proposal import ProposalResult

    ja = "# 提案\n\n## 背景\n本文\n\n## 前提条件\n- A\n\n## リスク\n- B"
    en = "# Proposal\n\n## Assumptions\n- A\n\n## Risks\n- B"
    for markdown, language in ((ja, "ja"), (en, "en")):
        validate_proposal(ProposalResult(title="t", markdown=markdown, language=language))
    with pytest.raises(ValueError, match="Rủi ro / Risks"):
        validate_proposal(
            ProposalResult(title="t", markdown="# x\n\n## 前提条件\n- A", language="ja")
        )
