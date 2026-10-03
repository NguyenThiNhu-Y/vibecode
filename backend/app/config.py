from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    llm_provider: Literal["mock", "vibeflow", "openai"] = "mock"
    llm_base_url: str = ""
    llm_api_key: str = ""
    model_name: str = ""
    llm_temperature: float = 0.2
    llm_timeout_s: float = 120
    llm_max_retries: int = 2  # retries for transient network/HTTP errors (not schema errors)
    pii_masking: bool = True  # mask emails/phones/URLs before text reaches the LLM
    db_path: str = "./scopeai.db"
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
