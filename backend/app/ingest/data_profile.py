"""Profile a data sample by code: types, null ratio, PII suspicion, readiness hint."""

import re
from datetime import date, datetime
from typing import Any

from app.ingest.tables import Sheet, cell_text, trim
from app.privacy import mask_pii
from app.schemas.attachments import ColumnProfile, ColumnType, DataProfile

_PII_NAME = re.compile(
    r"(email|e-mail|phone|sđt|sdt|điện thoại|dien thoai|tel|mobile|họ tên|ho ten|full.?name|"
    r"customer.?name|tên khách|địa chỉ|address|cmnd|cccd|passport|氏名|名前|電話|住所|メール)",
    re.IGNORECASE,
)
_BOOL = {"true", "false", "yes", "no", "có", "không", "y", "n", "0", "1"}
_DATE = re.compile(r"^\d{4}[-/]\d{1,2}[-/]\d{1,2}|^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}")
_NUMBER = re.compile(r"^-?[\d.,]+$")


def _dtype(values: list[Any]) -> ColumnType:
    present = [v for v in values if cell_text(v)]
    if not present:
        return "empty"
    if all(isinstance(v, (datetime, date)) or _DATE.match(cell_text(v)) for v in present):
        return "date"
    if (
        all(cell_text(v).lower() in _BOOL for v in present)
        and len({cell_text(v).lower() for v in present}) <= 2
    ):
        return "boolean"
    if all(isinstance(v, (int, float)) or _NUMBER.match(cell_text(v)) for v in present):
        return "number"
    return "text"


def _readiness(rows: int, avg_null: float) -> int:
    score = 5
    score -= 2 if rows < 100 else 1 if rows < 1000 else 0
    score -= 2 if avg_null > 0.3 else 1 if avg_null > 0.1 else 0
    return max(1, min(5, score))


def profile_sheet(sheet: Sheet) -> DataProfile | None:
    rows = trim(sheet.rows)
    if len(rows) < 2:
        return None
    header = [cell_text(c) or f"cột_{i + 1}" for i, c in enumerate(rows[0])]
    body = rows[1:]
    columns: list[ColumnProfile] = []
    for j, name in enumerate(header):
        values = [r[j] if j < len(r) else None for r in body]
        texts = [cell_text(v) for v in values]
        present = [t for t in texts if t]
        dtype = _dtype(values)
        pii = bool(_PII_NAME.search(name)) or any(mask_pii(t)[1] for t in present[:50])
        examples = [] if pii else [mask_pii(t[:40])[0] for t in dict.fromkeys(present)][:3]
        columns.append(
            ColumnProfile(
                name=name[:60],
                dtype=dtype,
                null_ratio=round(1 - len(present) / len(texts), 3) if texts else 1.0,
                unique=len(set(present)),
                examples=examples,
                pii_suspect=pii,
            )
        )
    avg_null = sum(c.null_ratio for c in columns) / len(columns)
    issues: list[str] = []
    if len(body) < 100:
        issues.append(f"Chỉ có {len(body)} dòng, quá ít để huấn luyện mô hình.")
    for c in columns:
        if c.null_ratio > 0.3:
            issues.append(f"Cột '{c.name}' thiếu {round(c.null_ratio * 100)}% giá trị.")
    if any(c.pii_suspect for c in columns):
        issues.append("Có cột nghi chứa dữ liệu cá nhân, cần ẩn danh trước khi dùng.")
    duplicates = len(body) - len({tuple(cell_text(v) for v in r) for r in body})
    if duplicates:
        issues.append(f"Có {duplicates} dòng trùng lặp.")
    if not any(c.dtype == "date" for c in columns):
        issues.append("Không có cột thời gian (hạn chế bài toán dự báo theo thời gian).")
    return DataProfile(
        sheet=sheet.name,
        rows=len(body),
        columns=columns[:60],
        issues=issues[:12],
        readiness_hint=_readiness(len(body), avg_null),
    )


def profile_tables(sheets: list[Sheet]) -> list[DataProfile]:
    return [p for p in (profile_sheet(s) for s in sheets) if p is not None][:10]
