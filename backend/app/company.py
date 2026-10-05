"""Company standards kept in the knowledge base (trang Cài đặt): profile and file naming,
standard content blocks, case studies. Pure code: nothing here is written by the LLM."""

import re
import unicodedata
from datetime import date
from pathlib import Path
from urllib.parse import quote

from app.knowledge import loader
from app.schemas.run import ScopingRun
from app.schemas.settings import CaseStudy, CompanyProfile, ContentBlock

CLIENT_FALLBACK = {"vi": "Quý khách", "en": "the Client", "ja": "お客様"}
MARKET_BY_LANGUAGE = {"vi": "vn", "ja": "jp", "en": "other"}
DOC_NAMES = {
    "slides": "Slides",
    "proposal": "Proposal",
    "workbook": "Estimate",
    "qa_sheet": "QA",
    "package": "Package",
    "markdown": "Proposal",
}


def load_company(kb_dir: Path | None = None) -> CompanyProfile:
    return CompanyProfile.model_validate(loader.load_yaml("company.yaml", kb_dir or loader.KB_DIR))


def load_content_blocks(kb_dir: Path | None = None) -> list[ContentBlock]:
    return [
        ContentBlock.model_validate(b)
        for b in loader.load_yaml("content_library.yaml", kb_dir or loader.KB_DIR) or []
    ]


def load_case_studies(kb_dir: Path | None = None) -> list[CaseStudy]:
    return [
        CaseStudy.model_validate(c)
        for c in loader.load_yaml("case_studies.yaml", kb_dir or loader.KB_DIR) or []
    ]


def fill(text: str, values: dict[str, str]) -> str:
    """Replace {{key}} placeholders; unknown keys are left as they are."""
    return re.sub(r"{{\s*(\w+)\s*}}", lambda m: values.get(m.group(1), m.group(0)), text)


def placeholders(run: ScopingRun, company: CompanyProfile, lang: str = "vi") -> dict[str, str]:
    version = run.versions[-1].version if run.versions else "0.1"
    return {
        "company_name": company.name,
        "company_short": company.short_name,
        "company_logo": company.short_name,  # text fallback when no logo has been uploaded
        "confidential_footer": company.confidential_footer,
        "client_name": run.client_name or CLIENT_FALLBACK.get(lang, CLIENT_FALLBACK["vi"]),
        "project_name": run.project_name or (run.proposal.title if run.proposal else run.id),
        "proposal_title": run.proposal.title if run.proposal else (run.project_name or "Proposal"),
        "date": f"{date.today():%Y-%m-%d}",
        "version": version,
        "run_id": run.id,
    }


def render_blocks(
    run: ScopingRun, company: CompanyProfile, blocks: list[ContentBlock], position: str, lang: str
) -> list[tuple[str, str]]:
    """Enabled standard blocks for one position, in the requested language (fallback: vi)."""
    values = placeholders(run, company, lang)
    return [
        (
            fill(b.title.get(lang) or b.title["vi"], values),
            fill(b.body.get(lang) or b.body["vi"], values).strip(),
        )
        for b in blocks
        if b.enabled and b.position == position
    ]


def _words(text: str | None) -> set[str]:
    return {w for w in re.findall(r"\w+", (text or "").lower()) if len(w) > 2}


def match_case_studies(run: ScopingRun, studies: list[CaseStudy], limit: int = 3) -> list[dict]:
    """Rank public case studies by pattern, market and industry/goal overlap (score 0..1)."""
    if run.intake is None:
        return []
    pattern = run.pattern.pattern.value if run.pattern else None
    market = MARKET_BY_LANGUAGE.get(run.intake.language, "other")
    industry = _words(run.intake.industry)
    goal = _words(run.intake.business_goal) | _words(" ".join(run.intake.data_sources))
    ranked = []
    for cs in studies:
        if not cs.public:
            continue
        score, reasons = 0.0, []
        if pattern and cs.pattern == pattern:
            score += 0.5
            reasons.append("Cùng hướng giải pháp")
        if cs.market == market:
            score += 0.2
            reasons.append("Cùng thị trường")
        if industry and industry & _words(cs.industry):
            score += 0.2
            reasons.append("Cùng ngành")
        overlap = goal & (_words(cs.title) | _words(cs.challenge) | _words(cs.solution))
        if overlap:
            score += min(0.1, 0.03 * len(overlap))
            reasons.append("Bài toán tương tự")
        if score >= 0.45:
            ranked.append({"case": cs, "score": round(score, 2), "reasons": reasons})
    return sorted(ranked, key=lambda r: r["score"], reverse=True)[:limit]


def _slug(text: str) -> str:
    text = re.sub(r"[\\/:*?\"<>|\r\n\t]+", " ", text).strip()
    return re.sub(r"\s+", "-", text)[:60]


def export_filename(
    run: ScopingRun, company: CompanyProfile, doc: str, ext: str, lang: str | None = None
) -> str:
    """Company naming rule, e.g. ABC_KhachHang_DuAn_Proposal_v1.0_20261003.docx."""
    values = {
        "company": company.short_name,
        "client": run.client_name or "KH",
        "project": run.project_name or run.id,
        "doc": DOC_NAMES.get(doc, doc) + (f"-{lang.upper()}" if lang and lang != "vi" else ""),
        "version": run.versions[-1].version if run.versions else "0.1",
        "date": f"{date.today():%Y%m%d}",
    }
    name = company.file_naming.format(**{k: _slug(v) for k, v in values.items()})
    name = re.sub(r"_+", "_", name).strip("_-") or f"scopeai_{run.id}_{doc}"
    return f"{name}.{ext}"


def content_disposition(filename: str) -> str:
    """attachment header with an ASCII fallback and the UTF-8 name (RFC 5987/6266)."""
    ascii_name = unicodedata.normalize("NFKD", filename.replace("đ", "d").replace("Đ", "D"))
    ascii_name = ascii_name.encode("ascii", "ignore").decode() or "download"
    ascii_name = ascii_name.replace('"', "")
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"
