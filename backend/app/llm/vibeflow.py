from app.config import Settings
from app.llm.base import LLMClient


class VibeFlowClient(LLMClient):
    """Placeholder until the VibeFlow API contract (endpoint, auth, payload) is known."""

    def __init__(self, settings: Settings):
        self.settings = settings

    async def complete(self, system: str, user: str, *, tag: str | None = None) -> str:
        raise NotImplementedError("Cần bổ sung cách gọi VibeFlow, xem AGENTS.md mục 3.3")
