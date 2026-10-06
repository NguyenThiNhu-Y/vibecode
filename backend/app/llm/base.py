from abc import ABC, abstractmethod

from app.config import Settings, get_settings


class LLMClient(ABC):
    """Single entry point for every LLM call in the app."""

    @abstractmethod
    async def complete(self, system: str, user: str, *, tag: str | None = None) -> str:
        """Return the raw text output of the model. `tag` is the step name (for mock/logging)."""


def get_llm(settings: Settings | None = None) -> LLMClient:
    settings = settings or get_settings()
    provider = settings.llm_provider
    if provider == "mock":
        from app.llm.mock import MockLLM

        return MockLLM(delay_s=0.8)
    from app.llm.cache import CachedLLM, ResponseCache
    from app.llm.retry import RetryingLLM

    client: LLMClient
    base_url = settings.llm_base_url
    if provider in ("openai", "openrouter"):
        from app.llm.openai_compat import OPENROUTER_BASE_URL, OpenAICompatClient

        api_key = settings.llm_api_key
        if provider == "openrouter":
            base_url = base_url or OPENROUTER_BASE_URL
            api_key = settings.openrouter_api_key or api_key
            if not api_key:
                raise ValueError("Thiếu OPENROUTER_API_KEY trong backend/.env")
        client = OpenAICompatClient(settings, base_url=base_url, api_key=api_key)
    elif provider == "vibeflow":
        from app.llm.vibeflow import VibeFlowClient

        client = VibeFlowClient(settings)
    else:
        raise ValueError(f"Unknown LLM_PROVIDER: {provider}")
    llm: LLMClient = RetryingLLM(client, max_retries=settings.llm_max_retries)
    if settings.llm_cache:
        identity = {
            "provider": provider,
            "base_url": base_url.rstrip("/"),
            "model": settings.model_name,
            "temperature": settings.llm_temperature,
            "json_mode": settings.llm_json_mode,
            "reasoning_effort": settings.llm_reasoning_effort,
            # not max_tokens / timeout: an output that passed validation was not cut off, so
            # raising the limits must not throw the cache away
        }
        llm = CachedLLM(llm, ResponseCache(settings.cache_path, identity))
    return llm
