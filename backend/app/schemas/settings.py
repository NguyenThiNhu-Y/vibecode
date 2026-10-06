"""Validated shapes of editable knowledge-base files (trang Cài đặt)."""

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import Phase

ESTIMATE_PATTERNS = {"rag", "agent", "classic_ml", "fine_tune", "no_ai_rule_based"}
MULTIPLIER_KEYS = {
    "on_prem",
    "japanese_language",
    "low_data_readiness",
    "strict_compliance",
    "multilingual",
    "ocr_required",
    "large_data_volume",
    "many_requirements",
}


class RoleRate(BaseModel):
    key: str = Field(pattern=r"^[a-z0-9_]+$")
    label: str = Field(min_length=1, max_length=60)
    day_rate: float = Field(gt=0)  # offshore
    onsite_day_rate: float | None = Field(default=None, gt=0)
    match: list[str] = []


class OverheadRule(BaseModel):
    key: str = Field(pattern=r"^[a-z0-9_]+$")
    label: str = Field(min_length=1, max_length=80)
    percent: float = Field(ge=0, le=100)
    role: str
    when: Literal["always", "japanese"] = "always"


class ContractSettings(BaseModel):
    default_model: Literal["fixed_price", "time_material", "odc"] = "fixed_price"
    default_onsite_ratio: float = Field(default=0, ge=0, le=100)
    working_days_per_month: int = Field(default=20, ge=1, le=31)


class Contingency(BaseModel):
    base_pct: float = Field(ge=0, le=100)
    per_high_risk_pct: float = Field(ge=0, le=100)
    max_pct: float = Field(ge=0, le=100)


class MilestoneRule(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    percent: float = Field(gt=0, le=100)


class Impact(BaseModel):
    manual_hours_per_proposal: float = Field(gt=0, le=1000)
    review_hours_per_proposal: float = Field(ge=0, le=1000)


class RateCard(BaseModel):
    currency: Literal["VND"] = "VND"
    exchange_rates: dict[Literal["USD", "JPY"], float]
    roles: list[RoleRate] = Field(min_length=1)
    default_role: str
    contingency: Contingency
    run_cost_monthly: dict[str, float]
    on_prem_run_cost_factor: float = Field(gt=0)
    overheads: list[OverheadRule] = []
    contract: ContractSettings = ContractSettings()
    milestones: list[MilestoneRule] = Field(min_length=1)
    impact: Impact

    @field_validator("exchange_rates")
    @classmethod
    def positive_rates(cls, value: dict[str, float]) -> dict[str, float]:
        if any(v <= 0 for v in value.values()) or set(value) != {"USD", "JPY"}:
            raise ValueError("Cần tỉ giá dương cho USD và JPY")
        return value

    @model_validator(mode="after")
    def consistent(self) -> "RateCard":
        keys = [r.key for r in self.roles]
        if len(set(keys)) != len(keys):
            raise ValueError("Mã vai trò bị trùng")
        if self.default_role not in keys:
            raise ValueError("default_role phải là một mã vai trò trong danh sách")
        unknown = [o.role for o in self.overheads if o.role not in keys]
        if unknown:
            raise ValueError(f"Overhead tham chiếu vai trò không tồn tại: {unknown}")
        if round(sum(m.percent for m in self.milestones), 6) != 100:
            raise ValueError("Tổng % các mốc thanh toán phải bằng 100")
        if self.contingency.base_pct > self.contingency.max_pct:
            raise ValueError("Dự phòng cơ bản không được lớn hơn mức tối đa")
        if any(v < 0 for v in self.run_cost_monthly.values()):
            raise ValueError("Chi phí vận hành không được âm")
        return self


class EstimationTemplate(BaseModel):
    unit: str = "person_days"
    base: dict[str, dict[Phase, list[int]]]
    multipliers: dict[str, float]
    many_requirements_min: int = Field(default=30, ge=1)  # rows in the customer's requirement file
    max_factor: float = Field(default=3.0, ge=1)  # cap on the stacked multipliers

    @model_validator(mode="after")
    def consistent(self) -> "EstimationTemplate":
        unknown = set(self.base) - ESTIMATE_PATTERNS
        if unknown:
            raise ValueError(f"Pattern không hợp lệ: {sorted(unknown)}")
        for pattern, phases in self.base.items():
            for phase, rng in phases.items():
                if len(rng) != 2 or rng[0] < 0 or rng[0] > rng[1]:
                    raise ValueError(f"{pattern}.{phase.value}: cần [min, max] với 0 ≤ min ≤ max")
        if set(self.multipliers) != MULTIPLIER_KEYS:
            raise ValueError(f"Hệ số phải gồm đúng: {sorted(MULTIPLIER_KEYS)}")
        if any(v <= 0 for v in self.multipliers.values()):
            raise ValueError("Hệ số phải lớn hơn 0")
        return self


REFERENCE_NAME = re.compile(r"^[a-z0-9_]{3,60}$")


Lang = Literal["vi", "en", "ja"]


class CompanyProfile(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    short_name: str = Field(min_length=1, max_length=40)
    confidential_footer: str = Field(default="", max_length=200)
    file_naming: str = Field(
        default="{company}_{client}_{project}_{doc}_v{version}_{date}", max_length=200
    )

    @field_validator("file_naming")
    @classmethod
    def known_fields(cls, value: str) -> str:
        allowed = {"company", "client", "project", "doc", "version", "date"}
        used = set(re.findall(r"{(\w+)}", value))
        if used - allowed:
            raise ValueError(f"Quy tắc đặt tên chỉ dùng: {sorted(allowed)}")
        if "doc" not in used:
            raise ValueError("Quy tắc đặt tên phải có {doc} để phân biệt các file")
        return value


class ContentBlock(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_]+$")
    enabled: bool = True
    position: Literal["start", "end"] = "end"
    title: dict[Lang, str]
    body: dict[Lang, str]

    @model_validator(mode="after")
    def has_vietnamese(self) -> "ContentBlock":
        if not self.title.get("vi") or not self.body.get("vi"):
            raise ValueError(f"{self.id}: cần có tiêu đề và nội dung tiếng Việt")
        return self


class CaseStudy(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_]+$")
    title: str = Field(min_length=3, max_length=200)
    industry: str = ""
    market: Literal["vn", "jp", "eu", "other"] = "other"
    pattern: Literal["no_ai_rule_based", "classic_ml", "rag", "agent", "fine_tune"]
    year: int | None = None
    public: bool = True
    challenge: str = ""
    solution: str = ""
    results: list[str] = []
    tech: list[str] = []
    duration: str = ""


class BidCriterion(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_]+$")
    label: str = Field(min_length=3, max_length=160)
    weight: float = Field(gt=0, le=10)
    auto: (
        Literal[
            "solution_clear",
            "data_ready",
            "business_value",
            "risk_acceptable",
            "requirements_fit",
            "budget_known",
        ]
        | None
    ) = None


class SheetMapping(BaseModel):
    sheet: str = Field(min_length=1, max_length=31)
    start_row: int = Field(ge=1, le=1000)
    columns: dict[str, str]

    @field_validator("columns")
    @classmethod
    def column_letters(cls, value: dict[str, str]) -> dict[str, str]:
        for key, col in value.items():
            if not re.fullmatch(r"[A-Z]{1,3}", col):
                raise ValueError(f"Cột của '{key}' phải là chữ cái Excel (A, B, …), nhận '{col}'")
        return value


TemplateKind = Literal["slides", "proposal_docx", "workbook", "qa_sheet"]
TemplateSource = Literal["builtin", "sample", "custom"]


class TemplatesConfig(BaseModel):
    active: dict[TemplateKind, TemplateSource]
    pptx: dict[str, object] = {}
    workbook: dict[Literal["wbs", "pricing"], SheetMapping]
    qa_sheet: SheetMapping
