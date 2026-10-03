import httpx

from app.config import Settings
from app.llm.base import LLMClient


class OpenAICompatClient(LLMClient):
    """Calls any OpenAI-compatible `POST {base_url}/chat/completions` endpoint."""

    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self.transport = transport

    async def complete(self, system: str, user: str, *, tag: str | None = None) -> str:
        s = self.settings
        async with httpx.AsyncClient(timeout=s.llm_timeout_s, transport=self.transport) as http:
            resp = await http.post(
                f"{s.llm_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {s.llm_api_key}"},
                json={
                    "model": s.model_name,
                    "temperature": s.llm_temperature,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                },
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
