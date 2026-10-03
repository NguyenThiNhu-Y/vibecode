"""Compact, budgeted view of attachments for LLM contexts (keeps prompts within limits)."""

from collections.abc import Callable
from typing import Any

from app.schemas.attachments import Attachment

DOCUMENT_BUDGET = 16_000  # total characters of document text across all files
REQUIREMENT_SAMPLE = 40


def attachments_digest(attachments: list[Attachment], mask: Callable[[str], str]) -> dict[str, Any]:
    if not attachments:
        return {}
    docs = [a for a in attachments if a.kind == "document" and a.text]
    per_doc = DOCUMENT_BUDGET // len(docs) if docs else 0
    requirements = [r for a in attachments if a.kind == "requirements" for r in a.requirements]
    digest: dict[str, Any] = {}
    if docs:
        digest["documents"] = [
            {
                "file": a.filename,
                "text": mask(a.text[:per_doc]),  # type: ignore[index]
                "truncated": a.truncated or len(a.text or "") > per_doc,
            }
            for a in docs
        ]
    if requirements:
        digest["requirements"] = {
            "count": len(requirements),
            "sample": [
                f"{r.id}: {mask(r.text[:200])}"
                + (f" (ưu tiên: {r.priority})" if r.priority else "")
                for r in requirements[:REQUIREMENT_SAMPLE]
            ],
        }
    data = [(a, p) for a in attachments if a.kind == "data_sample" for p in a.data_profiles]
    if data:
        digest["data_samples"] = [
            {
                "file": a.filename,
                "sheet": p.sheet,
                "rows": p.rows,
                "columns": [
                    {
                        "name": c.name,
                        "type": c.dtype,
                        "null_pct": round(c.null_ratio * 100),
                        "pii": c.pii_suspect,
                    }
                    for c in p.columns[:30]
                ],
                "issues": p.issues,
                "readiness_hint": p.readiness_hint,
            }
            for a, p in data
        ]
    code = [a for a in attachments if a.kind == "source_code" and a.code_profile]
    if code:
        digest["source_code"] = [
            {
                "file": a.filename,
                "languages": a.code_profile.languages,  # type: ignore[union-attr]
                "frameworks": a.code_profile.frameworks,  # type: ignore[union-attr]
                "total_lines": a.code_profile.total_lines,  # type: ignore[union-attr]
                "notes": a.code_profile.notes,  # type: ignore[union-attr]
            }
            for a in code
        ]
    return digest


def all_requirements(attachments: list[Attachment]):
    return [r for a in attachments if a.kind == "requirements" for r in a.requirements]
