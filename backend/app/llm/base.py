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
    from app.llm.retry import RetryingLLM

    if provider == "openai":
        from app.llm.openai_compat import OpenAICompatClient

        return RetryingLLM(OpenAICompatClient(settings), max_retries=settings.llm_max_retries)
    if provider == "vibeflow":
        from app.llm.vibeflow import VibeFlowClient

        return RetryingLLM(VibeFlowClient(settings), max_retries=settings.llm_max_retries)
    raise ValueError(f"Unknown LLM_PROVIDER: {provider}")
