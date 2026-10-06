import json

import pytest

from app.agents.step import Step, StepError, extract_json
from app.llm.cache import CachedLLM, ResponseCache
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


# ---------- response cache ----------
class CountingLLM:
    """Real-provider stand-in: replies in order, counts calls."""

    def __init__(self, replies: list[str]):
        self.replies, self.calls = list(replies), 0

    async def complete(self, system: str, user: str, *, tag: str | None = None) -> str:
        self.calls += 1
        return self.replies.pop(0)


def cached(inner, tmp_path, model: str = "m1") -> CachedLLM:
    return CachedLLM(inner, ResponseCache(tmp_path, {"provider": "openai", "model": model}))


async def test_cache_reuses_validated_output(tmp_path) -> None:
    step = Step("pattern", "03_pattern.md", PatternResult)
    first = CountingLLM([GOOD])
    result, _ = await step.run(cached(first, tmp_path), {"x": 1})
    files = list((tmp_path / "pattern").glob("*.json"))
    assert first.calls == 1 and len(files) == 1
    entry = json.loads(files[0].read_text(encoding="utf-8"))
    assert entry["step"] == "pattern" and entry["context"] == {"x": 1}
    assert entry["output"]["pattern"] == result.pattern.value and entry["attempts"] == 1

    second = CountingLLM([])  # would fail if called
    llm = cached(second, tmp_path)
    again, _ = await step.run(llm, {"x": 1})
    assert again == result and second.calls == 0
    assert [h.tag for h in llm.cache.hits] == ["pattern"]


async def test_cache_misses_on_other_context_or_model(tmp_path) -> None:
    step = Step("pattern", "03_pattern.md", PatternResult)
    await step.run(cached(CountingLLM([GOOD]), tmp_path), {"x": 1})
    other_input = CountingLLM([GOOD])
    await step.run(cached(other_input, tmp_path), {"x": 2})
    other_model = CountingLLM([GOOD])
    await step.run(cached(other_model, tmp_path, model="m2"), {"x": 1})
    assert other_input.calls == 1 and other_model.calls == 1


async def test_cache_never_stores_invalid_and_keeps_retry_fix(tmp_path) -> None:
    step = Step("pattern", "03_pattern.md", PatternResult, max_retries=1)
    with pytest.raises(StepError):
        await step.run(cached(CountingLLM(["sai", "vẫn sai"]), tmp_path), {"x": 1})
    assert not list(tmp_path.rglob("*.json"))

    await step.run(cached(CountingLLM(['{"pattern": "magic"}', GOOD]), tmp_path), {"x": 1})
    replay = CountingLLM([])
    llm = cached(replay, tmp_path)
    await step.run(llm, {"x": 1})  # stored under the first message, so no call at all
    assert replay.calls == 0 and llm.cache.hits[0].attempts == 2


async def test_cache_entry_failing_new_rules_is_ignored(tmp_path) -> None:
    await Step("pattern", "03_pattern.md", PatternResult).run(
        cached(CountingLLM([GOOD]), tmp_path), {"x": 1}
    )

    def stricter(result: PatternResult) -> PatternResult:
        if result.confidence.value == "high":
            raise ValueError("không cho phép high")
        return result

    fresh = CountingLLM([GOOD.replace('"high"', '"medium"')])
    step = Step("pattern", "03_pattern.md", PatternResult, post_validate=stricter)
    result, _ = await step.run(cached(fresh, tmp_path), {"x": 1})
    assert fresh.calls == 1 and result.confidence.value == "medium"
