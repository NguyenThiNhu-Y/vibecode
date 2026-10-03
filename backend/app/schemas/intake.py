from pydantic import BaseModel

from app.schemas.common import Language


class IntakeResult(BaseModel):
    business_goal: str
    current_process: str | None = None
    users: list[str] = []
    data_sources: list[str] = []
    constraints: list[str] = []  # e.g. "on_prem", "japanese_ui"
    budget: str | None = None
    timeline: str | None = None
    language: Language
    industry: str | None = None
