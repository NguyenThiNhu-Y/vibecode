"""Parse customer attachments by code (no LLM): documents, requirement lists, data, source code."""

from app.documents import MAX_TEXT_CHARS, DocumentError, extract_text
from app.ingest.code_profile import profile_zip
from app.ingest.data_profile import profile_tables
from app.ingest.requirements_excel import parse_requirements
from app.ingest.tables import read_tables
from app.schemas.attachments import Attachment, AttachmentKind

MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
MAX_ATTACHMENTS = 10
DOCUMENT_EXT = (".pdf", ".docx", ".txt", ".md")
TABLE_EXT = (".xlsx", ".csv", ".xls")
KINDS: tuple[AttachmentKind, ...] = ("requirements", "document", "data_sample", "source_code")

__all__ = ["DocumentError", "MAX_ATTACHMENTS", "KINDS", "build_attachment"]


def build_attachment(
    att_id: str, filename: str, data: bytes, kind: AttachmentKind | None = None
) -> Attachment:
    """Parse one uploaded file. `kind=None` auto-detects from extension and content."""
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise DocumentError(f"{filename}: file quá lớn (tối đa 20 MB).")
    lower = filename.lower()
    base = {"id": att_id, "filename": filename, "size_bytes": len(data)}
    try:
        if lower.endswith(".zip"):
            if kind not in (None, "source_code"):
                raise DocumentError("File .zip chỉ dùng cho source code.")
            return Attachment(**base, kind="source_code", code_profile=profile_zip(data))

        if lower.endswith(TABLE_EXT):
            if kind == "document":
                raise DocumentError("Bảng tính hãy chọn loại Requirement hoặc Data mẫu.")
            sheets = read_tables(filename, data)
            if kind in (None, "requirements"):
                requirements = parse_requirements(sheets, strict=kind is None)
                if requirements:
                    return Attachment(**base, kind="requirements", requirements=requirements)
                if kind == "requirements":
                    raise DocumentError(
                        "Không tìm thấy cột mô tả yêu cầu (ví dụ 'Yêu cầu', 'Requirement', '要件')."
                    )
            profiles = profile_tables(sheets)
            if not profiles:
                raise DocumentError("Bảng tính không có dữ liệu.")
            return Attachment(**base, kind="data_sample", data_profiles=profiles)

        if lower.endswith(DOCUMENT_EXT):
            if kind not in (None, "document"):
                raise DocumentError("File văn bản chỉ dùng làm tài liệu.")
            doc = extract_text(filename, data)
            return Attachment(
                **base,
                kind="document",
                text=str(doc["text"])[:MAX_TEXT_CHARS],
                pages=doc["pages"],  # type: ignore[arg-type]
                truncated=bool(doc["truncated"]),
            )
    except DocumentError as exc:
        message = str(exc)
        raise DocumentError(
            message if message.startswith(filename) else f"{filename}: {message}"
        ) from exc
    raise DocumentError(
        f"{filename}: định dạng chưa hỗ trợ (dùng .pdf, .docx, .txt, .md, .xlsx, .csv, .zip)."
    )
