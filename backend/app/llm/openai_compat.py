import httpx

from app.config import Settings
from app.llm.base import LLMClient

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class LLMResponseError(RuntimeError):
    """The provider answered 200 but without a usable message (e.g. an error object)."""


class OpenAICompatClient(LLMClient):
    """Calls any OpenAI-compatible `POST {base_url}/chat/completions` endpoint (OpenAI,
    OpenRouter, Ollama, vLLM, LM Studio, ...)."""

    def __init__(
        self,
        settings: Settings,
        transport: httpx.AsyncBaseTransport | None = None,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
    ):
        self.settings = settings
        self.transport = transport
        self.base_url = (base_url if base_url is not None else settings.llm_base_url).rstrip("/")
        self.api_key = api_key if api_key is not None else settings.llm_api_key

    async def complete(self, system: str, user: str, *, tag: str | None = None) -> str:
        s = self.settings
        body: dict = {
            "model": s.model_name,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        if s.llm_temperature is not None:
            body["temperature"] = s.llm_temperature
        if s.llm_max_tokens:
            body["max_tokens"] = s.llm_max_tokens
        if s.llm_reasoning_effort:
            body["reasoning"] = {"effort": s.llm_reasoning_effort}
        if s.llm_json_mode:
            body["response_format"] = {"type": "json_object"}
        async with httpx.AsyncClient(timeout=s.llm_timeout_s, transport=self.transport) as http:
            resp = await http.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            error = data.get("error") if isinstance(data, dict) else None
            raise LLMResponseError(f"Phản hồi LLM không có nội dung: {error or data}") from exc
        if not isinstance(content, str) or not content.strip():
            raise LLMResponseError("LLM trả về nội dung rỗng")
        return content
