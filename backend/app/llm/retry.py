import asyncio
import logging
from collections.abc import Awaitable, Callable

import httpx

from app.llm.base import LLMClient

logger = logging.getLogger("scopeai.llm")

TRANSIENT_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}


def is_transient(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TransportError):  # includes timeouts and connection errors
        return True
    return isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in TRANSIENT_STATUS


class RetryingLLM(LLMClient):
    """Retries transient provider errors with exponential backoff (1s, 2s, 4s, ...)."""

    def __init__(
        self,
        inner: LLMClient,
        max_retries: int = 2,
        base_delay_s: float = 1.0,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ):
        self.inner = inner
        self.max_retries = max_retries
        self.base_delay_s = base_delay_s
        self.sleep = sleep

    async def complete(self, system: str, user: str, *, tag: str | None = None) -> str:
        attempt = 0
        while True:
            try:
                return await self.inner.complete(system, user, tag=tag)
            except Exception as exc:
                if attempt >= self.max_retries or not is_transient(exc):
                    raise
                delay = self.base_delay_s * 2**attempt
                attempt += 1
                logger.warning(
                    "llm transient error tag=%s attempt=%d retry_in=%.1fs: %s",
                    tag,
                    attempt,
                    delay,
                    exc,
                )
                await self.sleep(delay)
