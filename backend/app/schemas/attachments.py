from typing import Literal

from pydantic import BaseModel, Field

AttachmentKind = Literal["requirements", "document", "data_sample", "source_code"]
ColumnType = Literal["number", "date", "text", "boolean", "empty"]


class RequirementItem(BaseModel):
    id: str
    text: str
    priority: str | None = None
    category: str | None = None
    sheet: str | None = None


class ColumnProfile(BaseModel):
    name: str
    dtype: ColumnType
    null_ratio: float = Field(ge=0, le=1)
    unique: int
    examples: list[str] = []  # PII-masked
    pii_suspect: bool = False


class DataProfile(BaseModel):
    sheet: str | None = None
    rows: int
    columns: list[ColumnProfile]
    issues: list[str] = []
    readiness_hint: int = Field(ge=1, le=5)  # computed by code, see app/ingest/data_profile.py


class CodeProfile(BaseModel):
    files: int
    total_lines: int
    languages: dict[str, int]  # language -> lines of code
    frameworks: list[str]
    top_dirs: list[str]
    has_tests: bool
    has_docker: bool
    notes: list[str] = []


class Attachment(BaseModel):
    id: str  # "a1", "a2", ...
    filename: str
    kind: AttachmentKind
    size_bytes: int
    text: str | None = None  # documents: extracted text (capped)
    pages: int | None = None
    truncated: bool = False
    requirements: list[RequirementItem] = []
    data_profiles: list[DataProfile] = []
    code_profile: CodeProfile | None = None
