"""Zip with every deliverable of a run."""

import io
import zipfile
from collections.abc import Callable

from app.exports.document import build_docx
from app.exports.qa_sheet import build_qa_sheet
from app.exports.slides import build_slides
from app.exports.workbook import build_workbook
from app.schemas.run import ScopingRun
from app.templates_store import ExportKit

README = """Bộ hồ sơ proposal sơ bộ do ScopeAI tạo (phiên {id}).

- slides.pptx        : slide trình bày (sơ đồ kiến trúc và timeline là shape, chỉnh sửa được)
- proposal.docx      : proposal dạng Word, kèm phụ lục effort / WBS / đáp ứng yêu cầu
- proposal.md        : proposal dạng Markdown
- workbook.xlsx      : effort và báo giá (công thức), WBS, timeline, bảng đáp ứng yêu cầu, rủi ro
- qa_sheet.xlsx      : danh sách câu hỏi làm rõ để gửi khách (theo ngôn ngữ của khách)
- architecture.mmd   : sơ đồ kiến trúc dạng Mermaid

Tên file theo quy tắc đặt tên của công ty (Cài đặt → Công ty); định dạng theo template đang chọn.

Trạng thái review: {status}. Tài liệu chỉ nên gửi khách sau khi AI dev đã duyệt.
"""


def build_package(
    run: ScopingRun,
    lang: str = "vi",
    tr: Callable[[str], str] | None = None,
    kit: ExportKit | None = None,
    names: dict[str, str] | None = None,
) -> bytes:
    """names maps each deliverable (slides.pptx, ...) to the file name used inside the zip."""
    kit = kit or ExportKit.load()
    name = lambda key: (names or {}).get(key, key)  # noqa: E731
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("README.txt", README.format(id=run.id, status=run.status.value))
        archive.writestr(name("slides.pptx"), build_slides(run, lang, tr, kit))
        archive.writestr(name("proposal.docx"), build_docx(run, kit))
        archive.writestr(name("workbook.xlsx"), build_workbook(run, kit))
        if run.proposal:
            archive.writestr(name("proposal.md"), run.proposal.markdown)
        if run.gaps and run.gaps.questions:
            archive.writestr(name("qa_sheet.xlsx"), build_qa_sheet(run, kit))
        if run.architecture and run.architecture.mermaid:
            archive.writestr(name("architecture.mmd"), run.architecture.mermaid)
    return buffer.getvalue()
