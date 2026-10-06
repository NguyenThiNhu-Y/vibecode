import asyncio
import json
from pathlib import Path

from app.config import BACKEND_DIR
from app.llm.base import LLMClient
from app.llm.mock_generators import GENERATORS

FIXTURE_DIR = BACKEND_DIR / "tests" / "fixtures"

# Demo-only scenarios: a keyword found in the user message (request text, or the scenario's own
# intake output carried in later contexts) swaps in scenario fixtures for the listed steps.
SCENARIOS: list[tuple[str, str]] = [
    ("excel", "no_ai"),
    ("năng suất", "clarify"),
]


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class MockLLM(LLMClient):
    """Deterministic LLM for tests and offline dev.

    With `responses`, replies for a tag are returned in order; the last one repeats once the
    queue is down to a single item. Tags missing from `responses` fall back to the fixtures.
    """

    def __init__(self, responses: dict[str, list[str]] | None = None, delay_s: float = 0.0):
        self.responses = {k: list(v) for k, v in (responses or {}).items()}
        self.delay_s = delay_s
        self.calls: list[str] = []

    async def complete(self, system: str, user: str, *, tag: str | None = None) -> str:
        if tag is None:
            raise ValueError("MockLLM requires a tag")
        self.calls.append(tag)
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        queue = self.responses.get(tag)
        if queue:
            return queue.pop(0) if len(queue) > 1 else queue[0]
        return self._fixture(tag, user)

    def _fixture(self, tag: str, user: str) -> str:
        if tag in GENERATORS:
            return GENERATORS[tag](user)
        lowered = user.lower()
        for keyword, scenario in SCENARIOS:
            if keyword in lowered:
                if tag == "gaps" and scenario == "clarify" and _has_answers(user):
                    candidate = FIXTURE_DIR / "scenarios" / scenario / "gaps_answered.json"
                else:
                    candidate = FIXTURE_DIR / "scenarios" / scenario / f"{tag}.json"
                if candidate.exists():
                    return _fit_estimates(tag, _read(candidate), user)
                break
        return _fit_estimates(tag, _read(FIXTURE_DIR / f"valid_{tag}.json"), user)


def _fit_estimates(tag: str, text: str, user: str) -> str:
    """Architecture fixtures take the code-computed effort ranges, so the mock passes the ±20%
    check whatever the estimation template says."""
    if tag != "architecture":
        return text
    try:
        computed = json.loads(user.split("\n\nLần trước output không hợp lệ")[0]).get(
            "computed_estimates"
        )
    except (json.JSONDecodeError, AttributeError):
        return text
    if not computed:
        return text
    data = json.loads(text)
    for estimate in data.get("estimates", []):
        if estimate["phase"] in computed:
            estimate["min_person_days"], estimate["max_person_days"] = computed[estimate["phase"]]
            estimate["adjustment_note"] = None
    return json.dumps(data, ensure_ascii=False)


def _has_answers(user: str) -> bool:
    try:
        return bool(json.loads(user.split("\n\n")[0]).get("answers"))
    except (json.JSONDecodeError, AttributeError):
        return False
