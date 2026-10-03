"""Detect and parse a customer's requirement list from a spreadsheet."""

import re

from app.ingest.tables import Sheet, cell_text, trim
from app.schemas.attachments import RequirementItem

MAX_REQUIREMENTS = 300

_ID = re.compile(r"^(id|no\.?|stt|#|mã|ma|req.?id|番号|no|項番|ref)$", re.IGNORECASE)
# Strong = the requirement description itself; weak = a short feature name (used as category).
_TEXT = re.compile(
    r"(requirement|yêu cầu|yeu cau|要件|要求|description|mô tả|内容|nội dung|詳細|chi tiết)",
    re.IGNORECASE,
)
_FEATURE = re.compile(r"(chức năng|tính năng|feature|function|機能)", re.IGNORECASE)
_PRIORITY = re.compile(r"(priority|ưu tiên|優先|mức độ|must|moscow)", re.IGNORECASE)
_CATEGORY = re.compile(r"(category|nhóm|phân loại|分類|module|phân hệ|区分|loại)", re.IGNORECASE)


def _header_index(rows: list[list]) -> tuple[int, dict[str, int]] | None:
    for i, row in enumerate(rows[:10]):
        headers = [cell_text(c) for c in row]
        if sum(1 for h in headers if h) < 2:
            continue  # a title row, not a header
        cols: dict[str, int] = {}
        for j, h in enumerate(headers):
            if not h:
                continue
            if "id" not in cols and _ID.match(h):
                cols["id"] = j
            elif "text" not in cols and _TEXT.search(h):
                cols["text"] = j
            elif "feature" not in cols and _FEATURE.search(h):
                cols["feature"] = j
            elif "priority" not in cols and _PRIORITY.search(h):
                cols["priority"] = j
            elif "category" not in cols and _CATEGORY.search(h):
                cols["category"] = j
        if "text" not in cols and "feature" in cols:
            cols["text"] = cols.pop("feature")
        elif "feature" in cols and "category" not in cols:
            cols["category"] = cols.pop("feature")
        if "text" in cols:
            return i, cols
    return None


def parse_requirements(sheets: list[Sheet]) -> list[RequirementItem]:
    """Return requirement rows; empty list when no sheet looks like a requirement list."""
    items: list[RequirementItem] = []
    for sheet in sheets:
        rows = trim(sheet.rows)
        found = _header_index(rows)
        if not found:
            continue
        header, cols = found
        data_rows = [r for r in rows[header + 1 :] if cell_text(r[cols["text"]])]
        if len(data_rows) < 2:
            continue
        for row in data_rows:
            rid = cell_text(row[cols["id"]]) if "id" in cols else ""
            items.append(
                RequirementItem(
                    id=rid or f"R{len(items) + 1:03d}",
                    text=cell_text(row[cols["text"]])[:500],
                    priority=cell_text(row[cols["priority"]]) or None
                    if "priority" in cols
                    else None,
                    category=cell_text(row[cols["category"]]) or None
                    if "category" in cols
                    else None,
                    sheet=sheet.name,
                )
            )
            if len(items) >= MAX_REQUIREMENTS:
                return _dedupe(items)
    return _dedupe(items)


def _dedupe(items: list[RequirementItem]) -> list[RequirementItem]:
    seen: dict[str, int] = {}
    for item in items:
        if item.id in seen:
            seen[item.id] += 1
            item.id = f"{item.id}-{seen[item.id]}"
        else:
            seen[item.id] = 1
    return items
