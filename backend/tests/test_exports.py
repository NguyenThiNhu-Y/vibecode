import io
import zipfile

from docx import Document
from openpyxl import load_workbook
from pptx import Presentation

from app.agents.pipeline import run_pipeline
from app.exports.common import parse_mermaid
from app.exports.document import build_docx
from app.exports.package import build_package
from app.exports.slides import build_slides
from app.exports.workbook import build_workbook
from app.ingest import build_attachment
from app.llm.mock import MockLLM
from tests.conftest import MemoryRepo, make_run
from tests.samples import code_zip, data_csv, requirements_xlsx


async def finished_run(with_attachments: bool = True):
    run = make_run()
    if with_attachments:
        run.attachments = [
            build_attachment("a1", "req.xlsx", requirements_xlsx()),
            build_attachment("a2", "data.csv", data_csv()),
            build_attachment("a3", "code.zip", code_zip()),
        ]
    async for _ in run_pipeline(MockLLM(), run, MemoryRepo()):
        pass
    return run


def test_parse_mermaid_nodes_edges_and_chains() -> None:
    graph = parse_mermaid(
        "flowchart LR\n  U[Người dùng] --> UI[Web] -->|REST| API(API)\n  API --> DB[(DB)]"
    )
    assert graph.nodes["U"] == "Người dùng" and graph.nodes["API"] == "API"
    assert (
        ("U", "UI") in graph.edges and ("UI", "API") in graph.edges and ("API", "DB") in graph.edges
    )


async def test_slides_contain_all_sections() -> None:
    run = await finished_run()
    prs = Presentation(io.BytesIO(build_slides(run)))
    text = " ".join(
        shape.text_frame.text
        for slide in prs.slides
        for shape in slide.shapes
        if shape.has_text_frame
    )
    # 13 analysis slides + "Về ABC" + case studies + grouped standard terms (content library)
    assert len(prs.slides) == 16
    for heading in [
        "Về ABC",
        "Dự án tương tự đã triển khai",
        "Phương pháp, chất lượng & điều khoản",
        "Chi phí dự kiến",
        "Kiến trúc hệ thống",
        "Timeline triển khai",
        "Đáp ứng yêu cầu",
        "WBS",
        "Tài liệu & dữ liệu",
    ]:
        assert heading in text


async def test_slides_skip_optional_sections_without_attachments() -> None:
    run = await finished_run(with_attachments=False)
    prs = Presentation(io.BytesIO(build_slides(run)))
    assert len(prs.slides) == 14


async def test_workbook_has_formulas_and_matrix() -> None:
    run = await finished_run()
    wb = load_workbook(io.BytesIO(build_workbook(run)))
    assert wb.sheetnames == [
        "Tổng quan",
        "Effort",
        "Báo giá",
        "WBS",
        "Timeline",
        "Đáp ứng yêu cầu",
        "Rủi ro",
        "Dữ liệu mẫu",
    ]
    quote = wb["Báo giá"]
    quote_formulas = [
        c.value
        for row in quote.iter_rows()
        for c in row
        if isinstance(c.value, str) and c.value.startswith("=")
    ]
    assert any(f.startswith("=SUM(E") for f in quote_formulas)
    assert any("*C" in f and f.startswith("=ROUND(") for f in quote_formulas)  # milestones
    effort = wb["Effort"]
    formulas = [
        c.value
        for row in effort.iter_rows()
        for c in row
        if isinstance(c.value, str) and c.value.startswith("=")
    ]
    assert any(f.startswith("=ROUND(") for f in formulas)
    matrix = wb["Đáp ứng yêu cầu"]
    assert matrix["A2"].value == "FR-01" and matrix["E2"].value


async def test_docx_has_proposal_and_appendix() -> None:
    run = await finished_run()
    doc = Document(io.BytesIO(build_docx(run)))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert (
        "Giả định" in text
        and "Phụ lục" in text
        and "C. WBS" in text
        and "D. Bảng đáp ứng yêu cầu" in text
    )
    assert len(doc.tables) >= 4


async def test_package_zip_lists_all_deliverables() -> None:
    run = await finished_run()
    names = zipfile.ZipFile(io.BytesIO(build_package(run))).namelist()
    assert set(names) == {
        "README.txt",
        "slides.pptx",
        "proposal.docx",
        "workbook.xlsx",
        "proposal.md",
        "architecture.mmd",
        "qa_sheet.xlsx",
    }
