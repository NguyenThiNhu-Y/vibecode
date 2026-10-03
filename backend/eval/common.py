"""Helpers shared by eval scripts."""

from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml

from app.config import get_settings
from app.llm.base import LLMClient, get_llm
from app.llm.mock import MockLLM
from app.schemas.run import ScopingRun

EVAL_DIR = Path(__file__).resolve().parent
CASES_DIR = EVAL_DIR / "cases"


class CountingLLM(LLMClient):
    """Wraps a client and counts calls per step tag (calls > 1 means the step retried)."""

    def __init__(self, inner: LLMClient):
        self.inner = inner
        self.calls: Counter[str] = Counter()

    async def complete(self, system: str, user: str, *, tag: str | None = None) -> str:
        self.calls[tag or "?"] += 1
        return await self.inner.complete(system, user, tag=tag)


class NullRepo:
    """Eval runs are not persisted to the app database."""

    def save(self, run: ScopingRun) -> None:
        return None


def make_llm() -> LLMClient:
    settings = get_settings()
    return MockLLM() if settings.llm_provider == "mock" else get_llm(settings)


def load_case(path: Path) -> dict[str, Any]:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def case_paths(case_id: str | None) -> list[Path]:
    if case_id:
        path = CASES_DIR / f"{case_id}.yaml"
        if not path.exists():
            raise SystemExit(f"Không tìm thấy case: {path}")
        return [path]
    return sorted(CASES_DIR.glob("*.yaml"))


def new_run(case: dict[str, Any]) -> ScopingRun:
    return ScopingRun(
        id=case["id"], created_at=datetime.now(UTC), request_text=case["request_text"]
    )
