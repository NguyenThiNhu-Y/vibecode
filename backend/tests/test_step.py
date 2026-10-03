import json

import pytest

from app.agents.step import Step, StepError, extract_json
from app.llm.mock import MockLLM
from app.schemas.pattern import PatternResult
from tests.conftest import fixture_text

GOOD = fixture_text("pattern")


def make_step(**kwargs) -> Step[PatternResult]:
    return Step("pattern", "03_pattern.md", PatternResult, kb_keys=["solution_patterns"], **kwargs)


class RecordingLLM(MockLLM):
    def __init__(self, replies: list[str]):
        super().__init__({"pattern": replies})
        self.systems: list[str] = []
        self.users: list[str] = []

    async def complete(self, system: str, user: str, *, tag: str | None = None) -> str:
        self.systems.append(system)
        self.users.append(user)
        return await super().complete(system, user, tag=tag)


def test_extract_json_from_fence_with_extra_text() -> None:
    raw = 'Đây là kết quả:\n```json\n{"a": {"b": 1}}\n```\nCảm ơn!'
    assert extract_json(raw) == {"a": {"b": 1}}


def test_extract_json_without_object_raises() -> None:
    with pytest.raises(ValueError):
        extract_json("không có json")


async def test_parses_fenced_output() -> None:
    llm = RecordingLLM([f"Kết quả:\n```json\n{GOOD}\n```"])
    result, latency = await make_step().run(llm, {"intake": {}})
    assert result.pattern.value == "rag"
    assert latency >= 0
    assert len(llm.calls) == 1


async def test_retries_after_schema_error() -> None:
    llm = RecordingLLM(['{"pattern": "magic"}', GOOD])
    result, _ = await make_step().run(llm, {})
    assert result.confidence.value == "high"
    assert len(llm.calls) == 2
    assert "Lần trước output không hợp lệ" in llm.users[1]
    assert "pattern" in llm.users[1]
    assert "Hãy trả lại JSON đúng schema." in llm.users[1]


async def test_post_validate_error_triggers_retry() -> None:
    attempts: list[int] = []

    def strict(result: PatternResult) -> PatternResult:
        attempts.append(1)
        if len(attempts) == 1:
            raise ValueError("lỗi post_validate giả lập")
        return result

    llm = RecordingLLM([GOOD, GOOD])
    await make_step(post_validate=strict).run(llm, {})
    assert len(llm.calls) == 2
    assert "lỗi post_validate giả lập" in llm.users[1]


async def test_raises_step_error_after_max_retries() -> None:
    llm = RecordingLLM(["không phải json", "vẫn không"])
    with pytest.raises(StepError) as info:
        await make_step(max_retries=1).run(llm, {})
    assert info.value.step == "pattern"
    assert len(llm.calls) == 2


async def test_retry_error_truncated_to_500_chars() -> None:
    bad = json.dumps({"pattern": "x" * 2000})
    llm = RecordingLLM([bad, GOOD])
    await make_step().run(llm, {})
    note = llm.users[1].split("Lần trước output không hợp lệ: ", 1)[1]
    assert len(note.split(". Hãy trả lại JSON")[0]) <= 500


async def test_system_prompt_contains_schema_and_knowledge() -> None:
    llm = RecordingLLM([GOOD])
    await make_step().run(llm, {"x": "Tiếng Việt có dấu"})
    system = llm.systems[0]
    assert "{{knowledge}}" not in system
    assert "### solution_patterns.yaml" in system
    assert "Chỉ trả về MỘT object JSON hợp lệ theo JSON Schema sau" in system
    assert json.dumps(PatternResult.model_json_schema(), ensure_ascii=False) in system
    assert "Tiếng Việt có dấu" in llm.users[0]
