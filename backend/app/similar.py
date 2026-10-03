"""Find past proposals similar to a run (pure code, for reuse by presales)."""

import re

from app.schemas.run import ScopingRun

STOPWORDS = {
    "và", "của", "cho", "các", "những", "một", "để", "với", "trong", "là", "có", "được", "the",
    "and", "for", "with", "to", "of", "a", "an", "in", "on", "ai",
}  # fmt: skip


def _tokens(text: str | None) -> set[str]:
    words = re.findall(r"\w+", (text or "").lower())
    return {w for w in words if len(w) > 1 and w not in STOPWORDS and not w.isdigit()}


def _jaccard(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def similarity(a: ScopingRun, b: ScopingRun) -> float:
    if not (a.intake and b.intake):
        return 0.0
    score = 0.0
    if a.pattern and b.pattern and a.pattern.pattern == b.pattern.pattern:
        score += 0.4
    score += 0.25 * _jaccard(_tokens(a.intake.business_goal), _tokens(b.intake.business_goal))
    score += 0.15 * _jaccard(_tokens(a.intake.industry), _tokens(b.intake.industry))
    score += 0.1 * _jaccard(set(a.intake.constraints), set(b.intake.constraints))
    score += 0.1 if a.intake.language == b.intake.language else 0.0
    return round(score, 3)


def find_similar(
    run: ScopingRun, others: list[ScopingRun], limit: int = 3
) -> list[tuple[ScopingRun, float]]:
    scored = [(o, similarity(run, o)) for o in others if o.id != run.id]
    return sorted([s for s in scored if s[1] >= 0.25], key=lambda s: s[1], reverse=True)[:limit]
