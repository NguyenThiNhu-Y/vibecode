import httpx
import pytest

from app.llm.base import LLMClient
from app.llm.retry import RetryingLLM, is_transient


class FlakyLLM(LLMClient):
    def __init__(self, errors: list[Exception]):
        self.errors = list(errors)
        self.calls = 0

    async def complete(self, system: str, user: str, *, tag: str | None = None) -> str:
        self.calls += 1
        if self.errors:
            raise self.errors.pop(0)
        return "ok"


def status_error(code: int) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://llm.example.invalid")
    return httpx.HTTPStatusError(
        "x", request=request, response=httpx.Response(code, request=request)
    )


async def no_sleep(_: float) -> None:
    return None


async def test_retries_transient_errors_then_succeeds() -> None:
    inner = FlakyLLM([httpx.ReadTimeout("slow"), status_error(503)])
    delays: list[float] = []

    async def record(delay: float) -> None:
        delays.append(delay)

    llm = RetryingLLM(inner, max_retries=2, base_delay_s=1.0, sleep=record)
    assert await llm.complete("s", "u", tag="intake") == "ok"
    assert inner.calls == 3
    assert delays == [1.0, 2.0]


async def test_gives_up_after_max_retries() -> None:
    inner = FlakyLLM([httpx.ConnectError("down")] * 5)
    with pytest.raises(httpx.ConnectError):
        await RetryingLLM(inner, max_retries=2, sleep=no_sleep).complete("s", "u")
    assert inner.calls == 3


async def test_does_not_retry_permanent_errors() -> None:
    inner = FlakyLLM([status_error(401)])
    with pytest.raises(httpx.HTTPStatusError):
        await RetryingLLM(inner, sleep=no_sleep).complete("s", "u")
    assert inner.calls == 1


def test_is_transient_classification() -> None:
    assert is_transient(status_error(429)) and is_transient(httpx.ReadTimeout("x"))
    assert not is_transient(status_error(400)) and not is_transient(ValueError("x"))
