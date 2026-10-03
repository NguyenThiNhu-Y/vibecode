"""Read and write editable knowledge-base files (trang Cài đặt). Validated before saving."""

from pathlib import Path
from typing import Any

import yaml

from app.bid import load_bid_criteria
from app.company import load_case_studies, load_company, load_content_blocks
from app.knowledge import loader
from app.schemas.settings import (
    REFERENCE_NAME,
    BidCriterion,
    CaseStudy,
    CompanyProfile,
    ContentBlock,
    EstimationTemplate,
    RateCard,
)

HEADER = "# Sửa từ trang Cài đặt của ScopeAI. Số liệu giả lập cho tới khi được thay bằng số thật.\n"


def _kb() -> Path:
    return loader.KB_DIR


def _write_yaml(name: str, data: dict[str, Any]) -> None:
    text = yaml.safe_dump(data, allow_unicode=True, sort_keys=False)
    (_kb() / name).write_text(HEADER + text, encoding="utf-8")
    loader.reload()


def _write_list(name: str, items: list[dict[str, Any]]) -> None:
    text = yaml.safe_dump(items, allow_unicode=True, sort_keys=False)
    (_kb() / name).write_text(HEADER + text, encoding="utf-8")


def read_settings() -> dict[str, Any]:
    refs = sorted((_kb() / "reference_projects").glob("*.md"))
    return {
        "rate_card": RateCard.model_validate(
            loader.load_yaml("rate_card.yaml", _kb())
        ).model_dump(),
        "estimation_template": EstimationTemplate.model_validate(
            loader.load_yaml("estimation_template.yaml", _kb())
        ).model_dump(mode="json"),
        "reference_projects": [
            {"name": p.stem, "content": p.read_text(encoding="utf-8")} for p in refs
        ],
        "company": load_company(_kb()).model_dump(),
        "content_library": [b.model_dump() for b in load_content_blocks(_kb())],
        "case_studies": [c.model_dump() for c in load_case_studies(_kb())],
        "bid_criteria": [c.model_dump() for c in load_bid_criteria(_kb())],
    }


def save_rate_card(data: dict[str, Any]) -> RateCard:
    card = RateCard.model_validate(data)
    _write_yaml("rate_card.yaml", card.model_dump())
    return card


def save_estimation_template(data: dict[str, Any]) -> EstimationTemplate:
    template = EstimationTemplate.model_validate(data)
    _write_yaml("estimation_template.yaml", template.model_dump(mode="json"))
    return template


def save_reference_project(name: str, content: str) -> None:
    if not REFERENCE_NAME.match(name):
        raise ValueError("Tên dự án tham chiếu chỉ gồm a-z, 0-9, dấu gạch dưới (3–60 ký tự)")
    if len(content.strip()) < 20:
        raise ValueError("Nội dung dự án tham chiếu quá ngắn")
    if len(content) > 6000:
        raise ValueError("Nội dung dự án tham chiếu tối đa 6.000 ký tự")
    (_kb() / "reference_projects" / f"{name}.md").write_text(
        content.strip() + "\n", encoding="utf-8"
    )
    loader.reload()


def delete_reference_project(name: str) -> bool:
    path = _kb() / "reference_projects" / f"{name}.md"
    if not REFERENCE_NAME.match(name) or not path.exists():
        return False
    path.unlink()
    loader.reload()
    return True


def _unique(items: list[Any], what: str) -> None:
    ids = [i.id for i in items]
    if len(ids) != len(set(ids)):
        raise ValueError(f"Mã {what} bị trùng: {sorted({i for i in ids if ids.count(i) > 1})}")


def save_company(data: dict[str, Any]) -> CompanyProfile:
    company = CompanyProfile.model_validate(data)
    _write_yaml("company.yaml", company.model_dump())
    return company


def save_content_library(items: list[dict[str, Any]]) -> list[ContentBlock]:
    blocks = [ContentBlock.model_validate(i) for i in items]
    _unique(blocks, "nội dung")
    _write_list("content_library.yaml", [b.model_dump() for b in blocks])
    return blocks


def save_case_studies(items: list[dict[str, Any]]) -> list[CaseStudy]:
    studies = [CaseStudy.model_validate(i) for i in items]
    _unique(studies, "case study")
    _write_list("case_studies.yaml", [c.model_dump() for c in studies])
    return studies


def save_bid_criteria(items: list[dict[str, Any]]) -> list[BidCriterion]:
    criteria = [BidCriterion.model_validate(i) for i in items]
    if not criteria:
        raise ValueError("Cần ít nhất một tiêu chí Bid/No-bid")
    _unique(criteria, "tiêu chí")
    _write_list("bid_criteria.yaml", [c.model_dump() for c in criteria])
    return criteria
