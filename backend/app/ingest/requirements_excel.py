"""Detect and parse a customer's requirement list from a spreadsheet."""

import re

from app.ingest.tables import Sheet, cell_text, trim
from app.schemas.attachments import RequirementItem

MAX_REQUIREMENTS = 300

_ID = re.compile(r"^(id|no\.?|stt|#|mã|ma|req.?id|番号|no|項番|ref)$", re.IGNORECASE)
# "要件ID", "要件番号", "Req. No", "Mã YC", "ID yêu cầu": an id column even though it says 要件
_ID_LIKE = re.compile(
    r"(^(mã|ma)\b|^id\b|(id|番号|no\.?)$|^req(uirement)?[\s._-]*(id|no))", re.IGNORECASE
)
# Description columns win over a column that only names the requirement ("要件名", "Tên").
_DESCRIPTION = re.compile(
    r"(内容|詳細|説明|概要|description|details?|mô tả|nội dung|chi tiết|diễn giải)", re.IGNORECASE
)
_TEXT = re.compile(r"(requirement|yêu cầu|yeu cau|要件|要求)", re.IGNORECASE)
_NAME = re.compile(r"(名$|名称|name|title|tên)", re.IGNORECASE)
_FEATURE = re.compile(r"(chức năng|tính năng|feature|function|機能)", re.IGNORECASE)
_PRIORITY = re.compile(r"(priority|ưu tiên|優先|mức độ|must|moscow)", re.IGNORECASE)
_CATEGORY = re.compile(r"(category|nhóm|phân loại|分類|module|phân hệ|区分|loại)", re.IGNORECASE)


def _is_id(header: str) -> bool:
    return bool(_ID.match(header) or (len(header) <= 14 and _ID_LIKE.search(header)))


def _header_index(rows: list[list]) -> tuple[int, dict[str, int]] | None:
    for i, row in enumerate(rows[:10]):
        headers = [cell_text(c) for c in row]
        if sum(1 for h in headers if h) < 2:
            continue  # a title row, not a header
        cols: dict[str, int] = {}
        ids = [j for j, h in enumerate(headers) if h and _is_id(h)]
        if ids:  # "要件ID" beats a plain "No." running number
            cols["id"] = next((j for j in ids if not _ID.match(headers[j])), ids[0])
        free = [(j, h) for j, h in enumerate(headers) if h and j not in ids]
        description = next((j for j, h in free if _DESCRIPTION.search(h)), None)
        text = next((j for j, h in free if _TEXT.search(h) and not _NAME.search(h)), None)
        if description is not None or text is not None:
            cols["text"] = description if description is not None else text  # type: ignore[assignment]
        for j, h in free:
            if j == cols.get("text"):
                continue
            if "name" not in cols and _NAME.search(h) and (_TEXT.search(h) or _FEATURE.search(h)):
                cols["name"] = j
            elif "name" not in cols and description is not None and _TEXT.search(h):
                cols["name"] = j  # "Requirement" next to a "Description" column
            elif "feature" not in cols and _FEATURE.search(h):
                cols["feature"] = j
            elif "priority" not in cols and _PRIORITY.search(h):
                cols["priority"] = j
            elif "category" not in cols and _CATEGORY.search(h):
                cols["category"] = j
            elif "name" not in cols and _NAME.search(h) and "text" in cols:
                cols["name"] = j
        if "text" not in cols:
            for key in ("feature", "name"):
                if key in cols:
                    cols["text"] = cols.pop(key)
                    break
        if "feature" in cols and "category" not in cols:
            cols["category"] = cols.pop("feature")
        if "text" in cols:
            return i, cols
    return None


def _text(row: list, cols: dict[str, int]) -> str:
    """Description, prefixed by the requirement's short name when the sheet has one."""
    text = cell_text(row[cols["text"]])
    name = cell_text(row[cols["name"]]) if "name" in cols else ""
    return f"{name}: {text}" if name and name not in text else text


def parse_requirements(sheets: list[Sheet], strict: bool = False) -> list[RequirementItem]:
    """Return requirement rows; empty list when no sheet looks like a requirement list.

    strict (auto-detection): the header must name requirements or features, so a data table
    with a free-text column such as 処置内容 / "Nội dung" is not taken for a requirement list."""
    items: list[RequirementItem] = []
    for sheet in sheets:
        rows = trim(sheet.rows)
        found = _header_index(rows)
        if not found:
            continue
        header, cols = found
        if strict and not any(
            _TEXT.search(h) or _FEATURE.search(h) for h in map(cell_text, rows[header])
        ):
            continue
        data_rows = [r for r in rows[header + 1 :] if cell_text(r[cols["text"]])]
        if len(data_rows) < 2:
            continue
        for row in data_rows:
            rid = cell_text(row[cols["id"]]) if "id" in cols else ""
            items.append(
                RequirementItem(
                    id=rid or f"R{len(items) + 1:03d}",
                    text=_text(row, cols)[:500],
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
