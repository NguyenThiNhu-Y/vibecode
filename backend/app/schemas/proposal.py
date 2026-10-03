from pydantic import BaseModel

from app.schemas.common import Language


class ProposalResult(BaseModel):
    title: str
    markdown: str
    language: Language


class TranslationResult(BaseModel):
    markdown: str


class TranslatedItems(BaseModel):
    items: list[str]
