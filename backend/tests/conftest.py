import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from app.schemas.run import ScopingRun

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(step: str) -> dict[str, Any]:
    return json.loads((FIXTURES / f"valid_{step}.json").read_text(encoding="utf-8"))


def fixture_text(step: str) -> str:
    return (FIXTURES / f"valid_{step}.json").read_text(encoding="utf-8")


class MemoryRepo:
    """In-memory stand-in for RunRepo; keeps a JSON snapshot per save."""

    def __init__(self) -> None:
        self.rows: dict[str, str] = {}
        self.saves = 0

    def save(self, run: ScopingRun) -> None:
        self.saves += 1
        self.rows[run.id] = run.model_dump_json()

    def get(self, run_id: str) -> ScopingRun | None:
        raw = self.rows.get(run_id)
        return ScopingRun.model_validate_json(raw) if raw else None


@pytest.fixture
def memory_repo() -> MemoryRepo:
    return MemoryRepo()


def make_run(
    request_text: str = "Yêu cầu giả lập đủ dài để vượt qua kiểm tra độ dài.",
) -> ScopingRun:
    return ScopingRun(id="abcd1234", created_at=datetime.now(UTC), request_text=request_text)
