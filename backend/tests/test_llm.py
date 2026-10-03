import json

import httpx
import pytest

from app.config import Settings
from app.llm.base import get_llm
from app.llm.mock import MockLLM
from app.llm.openai_compat import OpenAICompatClient
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
def test_get_llm_selects_class(provider: str, cls: type) -> None:
    llm = get_llm(Settings(llm_provider=provider))
    if provider != "mock":
        assert isinstance(llm, RetryingLLM)
        llm = llm.inner
    assert isinstance(llm, cls)


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
