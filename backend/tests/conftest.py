import json
import os

# Tests never call a real LLM, whatever backend/.env says (env vars win over the .env file).
os.environ["LLM_PROVIDER"] = "mock"
os.environ["LLM_CACHE"] = "false"
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from app.schemas.run import ScopingRun

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session", autouse=True)
def _isolated_kb(tmp_path_factory):
    """Tests never see this machine's Settings (active templates, uploaded logo / templates):
    they run on a copy of the knowledge base with every template source back to builtin."""
    import shutil

    import yaml

    from app.agents import estimate, pricing
    from app.knowledge import loader

    target = tmp_path_factory.mktemp("kb") / "knowledge_base"
    shutil.copytree(loader.KB_DIR, target, ignore=shutil.ignore_patterns("custom"))
    config = target / "templates.yaml"
    data = yaml.safe_load(config.read_text(encoding="utf-8"))
    data["active"] = dict.fromkeys(data["active"], "builtin")
    config.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")
    with pytest.MonkeyPatch.context() as mp:
        for module in (loader, estimate, pricing):  # the last two bind KB_DIR at import
            mp.setattr(module, "KB_DIR", target)
        loader.reload()
        yield target
    loader.reload()


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
