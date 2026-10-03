from pathlib import Path

from app.knowledge.loader import KB_DIR, load_yaml
from app.schemas.common import Phase, SolutionPattern
from app.schemas.effort import EffortBasis, Multiplier
from app.schemas.feasibility import FeasibilityResult
from app.schemas.intake import IntakeResult
from app.schemas.pattern import PatternResult

TEMPLATE_FILE = "estimation_template.yaml"

MULTIPLIER_LABELS = {
    "on_prem": "Triển khai on-premise",
    "japanese_language": "Khách hàng tiếng Nhật",
    "low_data_readiness": "Dữ liệu chưa sẵn sàng (≤ 2/5)",
    "strict_compliance": "Yêu cầu tuân thủ nghiêm ngặt",
}


def _normalize(token: str) -> str:
    return token.strip().lower().replace("-", "_").replace(" ", "_")


def explain_estimates(
    pattern: PatternResult,
    intake: IntakeResult,
    feasibility: FeasibilityResult,
    template_path: Path | None = None,
) -> EffortBasis | None:
    """Return base, applied multipliers and computed ranges. Pure, no LLM."""
    path = template_path or KB_DIR / TEMPLATE_FILE
    template = load_yaml(path.name, path.parent)
    if pattern.pattern == SolutionPattern.NEEDS_CLARIFICATION:
        return None
    base = (template.get("base") or {}).get(pattern.pattern.value)
    if not base:
        return None

    factors = template.get("multipliers") or {}
    constraints = {_normalize(c) for c in intake.constraints}
    applied = [
        key
        for key, active in (
            ("on_prem", "on_prem" in constraints),
            ("japanese_language", intake.language == "ja"),
            ("low_data_readiness", feasibility.data_readiness <= 2),
            ("strict_compliance", "strict_compliance" in constraints),
        )
        if active
    ]
    multipliers = [
        Multiplier(key=key, label=MULTIPLIER_LABELS[key], factor=float(factors.get(key, 1.0)))
        for key in applied
    ]
    factor = 1.0
    for m in multipliers:
        factor *= m.factor

    return EffortBasis(
        pattern=pattern.pattern,
        base={Phase(p): [low, high] for p, (low, high) in base.items()},
        multipliers=multipliers,
        factor=round(factor, 4),
        computed={
            Phase(p): [round(low * factor), round(high * factor)] for p, (low, high) in base.items()
        },
    )


def compute_estimates(
    pattern: PatternResult,
    intake: IntakeResult,
    feasibility: FeasibilityResult,
    template_path: Path | None = None,
) -> dict[Phase, tuple[int, int]]:
    """Baseline effort per phase = base[pattern][phase] x stacked multipliers. Pure, no LLM."""
    basis = explain_estimates(pattern, intake, feasibility, template_path)
    if basis is None:
        return {}
    return {phase: (low, high) for phase, (low, high) in basis.computed.items()}
