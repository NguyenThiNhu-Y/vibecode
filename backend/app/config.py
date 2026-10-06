from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    llm_provider: Literal["mock", "vibeflow", "openai", "openrouter"] = "mock"
    llm_base_url: str = ""  # openrouter: defaults to OPENROUTER_BASE_URL
    llm_api_key: str = ""
    openrouter_api_key: str = ""  # used when LLM_PROVIDER=openrouter (falls back to LLM_API_KEY)
    model_name: str = ""
    llm_temperature: float | None = 0.2  # empty / none: not sent (Claude Opus 5.5 rejects it)
    llm_max_tokens: int | None = None  # max output tokens incl. reasoning; empty: provider default
    llm_reasoning_effort: str = ""  # e.g. low | medium | high (OpenRouter `reasoning.effort`)
    llm_timeout_s: float = 120
    llm_max_retries: int = 2  # retries for transient network/HTTP errors (not schema errors)
    llm_json_mode: bool = (
        False  # send response_format=json_object (only for models that support it)
    )
    llm_cache: bool = True  # reuse validated outputs from llm_cache_dir (never for the mock)
    llm_cache_dir: str = "llm_cache"  # relative to backend/
    pii_masking: bool = True  # mask emails/phones/URLs before text reaches the LLM
    db_path: str = "./scopeai.db"
    cors_origins: str = "http://localhost:5173"

    @field_validator("llm_temperature", "llm_max_tokens", mode="before")
    @classmethod
    def _blank_is_none(cls, value: object) -> object:
        return None if isinstance(value, str) and value.strip().lower() in ("", "none") else value

    @property
    def cache_path(self) -> Path:
        path = Path(self.llm_cache_dir)
        return path if path.is_absolute() else BACKEND_DIR / path

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
