"""Disk cache of validated LLM outputs, to avoid paying twice for the same call.

One JSON file per call: llm_cache/<step>/<key>.json. The key hashes the model identity
(provider, endpoint, model, temperature, JSON mode, reasoning effort; not max_tokens / timeout)
with the step's system prompt and its first user message, so any change to the prompt, the
knowledge base, the customer input or the model misses the cache. Only outputs that passed the
step's validation are stored (agents/step.py), so a bad answer is never replayed. Files are
plain JSON and can be read or deleted by hand.
"""

import hashlib
import json
import logging
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.llm.base import LLMClient

logger = logging.getLogger("scopeai.llm.cache")


@dataclass
class CacheHit:
    tag: str
    response: str
    latency_ms: int  # latency of the original call
    attempts: int  # attempts the original call needed (1 = valid on the first try)


class ResponseCache:
    def __init__(self, directory: Path, identity: dict[str, Any]):
        self.directory = directory
        self.identity = identity
        self.hits: list[CacheHit] = []  # hits served by this instance (eval / replay recorder)

    def key(self, tag: str, system: str, user: str) -> str:
        payload = json.dumps([self.identity, tag, system, user], ensure_ascii=False)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _path(self, tag: str, key: str) -> Path:
        return self.directory / (tag or "untagged") / f"{key[:32]}.json"

    def get(self, tag: str, system: str, user: str) -> CacheHit | None:
        key = self.key(tag, system, user)
        path = self._path(tag, key)
        if not path.exists():
            return None
        try:
            entry = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            logger.warning("unreadable cache file %s, ignored", path)
            return None
        if entry.get("key") != key or not isinstance(entry.get("response"), str):
            return None
        return CacheHit(tag, entry["response"], int(entry.get("latency_ms", 0)),
                        int(entry.get("attempts", 1)))  # fmt: skip

    def put(
        self, tag: str, system: str, user: str, response: str, latency_ms: int, attempts: int
    ) -> None:
        key = self.key(tag, system, user)
        path = self._path(tag, key)
        try:
            context: Any = json.loads(user)
        except ValueError:
            context = user
        try:
            output: Any = json.loads(response)
        except ValueError:
            output = None  # the raw text had fences or prose around the JSON
        entry = {
            "key": key,
            "step": tag,
            "created_at": datetime.now(UTC).isoformat(),
            **self.identity,
            "latency_ms": latency_ms,
            "attempts": attempts,
            "system_prompt_sha256": hashlib.sha256(system.encode("utf-8")).hexdigest(),
            "context": context,  # what the step sent (already PII-masked)
            "response": response,  # raw model text, replayed on a hit
            "output": output,  # parsed for easy reading
        }
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(entry, ensure_ascii=False, indent=2), encoding="utf-8")
            os.replace(tmp, path)  # atomic: a crash never leaves half a file
        except OSError as exc:
            logger.warning("could not write cache file %s: %s", path, exc)


class CachedLLM(LLMClient):
    """Carries a ResponseCache for the steps; calls pass straight through to the provider."""

    def __init__(self, inner: LLMClient, cache: ResponseCache):
        self.inner = inner
        self.cache = cache

    async def complete(self, system: str, user: str, *, tag: str | None = None) -> str:
        return await self.inner.complete(system, user, tag=tag)


def response_cache(llm: LLMClient) -> ResponseCache | None:
    """The cache of an LLM client, looking through wrappers (retry, eval call counter)."""
    current: Any = llm
    for _ in range(6):
        if isinstance(current, CachedLLM):
            return current.cache
        current = getattr(current, "inner", None)
        if current is None:
            return None
    return None
