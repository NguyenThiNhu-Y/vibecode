import json

import httpx
import pytest

from app.config import Settings
from app.llm.base import get_llm
from app.llm.cache import CachedLLM, response_cache
from app.llm.mock import MockLLM
from app.llm.openai_compat import LLMResponseError, OpenAICompatClient
from app.llm.retry import RetryingLLM
from app.llm.vibeflow import VibeFlowClient
from tests.conftest import fixture_text


async def test_mock_returns_in_order_then_repeats_last() -> None:
    llm = MockLLM({"intake": ["a", "b"]})
    assert await llm.complete("s", "u", tag="intake") == "a"
    assert await llm.complete("s", "u", tag="intake") == "b"
    assert await llm.complete("s", "u", tag="intake") == "b"
    assert llm.calls == ["intake"] * 3


async def test_mock_defaults_to_fixtures() -> None:
    llm = MockLLM()
    assert await llm.complete("s", "{}", tag="pattern") == fixture_text("pattern")


async def test_mock_clarify_scenario_switches_after_answers() -> None:
    llm = MockLLM()
    first = json.loads(
        await llm.complete(
            "s", json.dumps({"request_text": "tăng năng suất"}, ensure_ascii=False), tag="gaps"
        )
    )
    assert first["can_proceed"] is False
    payload = json.dumps(
        {"request_text": "tăng năng suất", "answers": {"q1": "CSKH"}}, ensure_ascii=False
    )
    second = json.loads(await llm.complete("s", payload, tag="gaps"))
    assert second["can_proceed"] is True


@pytest.mark.parametrize(
    ("provider", "cls"),
    [("mock", MockLLM), ("openai", OpenAICompatClient), ("vibeflow", VibeFlowClient)],
)
def test_get_llm_selects_class(provider: str, cls: type, tmp_path) -> None:
    llm = get_llm(Settings(llm_provider=provider, llm_cache=True, llm_cache_dir=str(tmp_path)))
    if provider != "mock":
        assert isinstance(llm, CachedLLM) and isinstance(llm.inner, RetryingLLM)
        llm = llm.inner.inner
    assert isinstance(llm, cls)


def test_mock_and_disabled_cache_have_no_cache(tmp_path) -> None:
    assert response_cache(get_llm(Settings(llm_provider="mock"))) is None
    off = get_llm(Settings(llm_provider="openai", llm_cache=False))
    assert isinstance(off, RetryingLLM) and response_cache(off) is None


def test_openrouter_defaults_and_key(tmp_path) -> None:
    with pytest.raises(ValueError, match="OPENROUTER_API_KEY"):
        get_llm(Settings(llm_provider="openrouter", llm_api_key="", openrouter_api_key=""))
    llm = get_llm(
        Settings(llm_provider="openrouter", openrouter_api_key="sk-or-test", llm_base_url="",
                 model_name="qwen/x:free", llm_cache=True, llm_cache_dir=str(tmp_path))
    )  # fmt: skip
    client = llm.inner.inner
    assert client.base_url == "https://openrouter.ai/api/v1" and client.api_key == "sk-or-test"
    cache = response_cache(llm)
    assert cache.identity["model"] == "qwen/x:free" and cache.directory == tmp_path


async def test_openai_compat_json_mode_and_error_body() -> None:
    bodies: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(request.content))
        if len(bodies) == 1:
            return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})
        return httpx.Response(200, json={"error": {"message": "No endpoints found"}})

    settings = Settings(llm_base_url="http://llm.test/v1", model_name="m", llm_json_mode=True)
    client = OpenAICompatClient(settings, transport=httpx.MockTransport(handler))
    assert await client.complete("s", "u") == "{}"
    assert bodies[0]["response_format"] == {"type": "json_object"}
    with pytest.raises(LLMResponseError, match="No endpoints found"):
        await client.complete("s", "u")


async def test_vibeflow_not_implemented() -> None:
    with pytest.raises(NotImplementedError, match="VibeFlow"):
        await VibeFlowClient(Settings()).complete("s", "u")


async def test_openai_compat_request_and_response() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "xin chào"}}]})

    settings = Settings(
        llm_provider="openai",
        llm_base_url="https://llm.example.invalid/v1/",
        llm_api_key="fake-key",
        model_name="fake-model",
        llm_temperature=0.1,
    )
    client = OpenAICompatClient(settings, transport=httpx.MockTransport(handler))
    assert await client.complete("SYS", "USER", tag="intake") == "xin chào"
    assert seen["url"] == "https://llm.example.invalid/v1/chat/completions"
    assert seen["auth"] == "Bearer fake-key"
    assert seen["body"]["model"] == "fake-model"
    assert seen["body"]["temperature"] == 0.1
    assert seen["body"]["messages"] == [
        {"role": "system", "content": "SYS"},
        {"role": "user", "content": "USER"},
    ]


async def test_openai_compat_raises_on_http_error() -> None:
    client = OpenAICompatClient(
        Settings(llm_base_url="https://llm.example.invalid"),
        transport=httpx.MockTransport(lambda r: httpx.Response(500)),
    )
    with pytest.raises(httpx.HTTPStatusError):
        await client.complete("s", "u")


async def test_openai_compat_optional_params_for_reasoning_models() -> None:
    bodies: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})

    transport = httpx.MockTransport(handler)
    opus = Settings(
        llm_base_url="http://llm.test/v1",
        model_name="anthropic/claude-opus-5.5",
        llm_temperature="",
        llm_max_tokens="32000",
        llm_reasoning_effort="medium",
    )
    await OpenAICompatClient(opus, transport=transport).complete("s", "u")
    assert "temperature" not in bodies[0] and bodies[0]["max_tokens"] == 32000
    assert bodies[0]["reasoning"] == {"effort": "medium"}
    plain = Settings(llm_base_url="http://llm.test/v1", model_name="m", llm_temperature=0.2,
                     llm_max_tokens="", llm_reasoning_effort="")  # fmt: skip
    await OpenAICompatClient(plain, transport=transport).complete("s", "u")
    assert bodies[1]["temperature"] == 0.2 and "max_tokens" not in bodies[1]
    assert "reasoning" not in bodies[1]


def test_cache_key_ignores_token_limit_and_timeout(tmp_path) -> None:
    def identity(**extra):
        settings = Settings(llm_provider="openai", llm_cache=True, llm_cache_dir=str(tmp_path),
                            model_name="m", llm_base_url="http://x/v1", **extra)  # fmt: skip
        return response_cache(get_llm(settings)).identity

    assert identity(llm_max_tokens=32000, llm_timeout_s=300) == identity(
        llm_max_tokens=64000, llm_timeout_s=600
    )
    assert identity(llm_reasoning_effort="low") != identity(llm_reasoning_effort="high")
