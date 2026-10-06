import io

import pytest

from app.ingest import DocumentError, build_attachment
from app.ingest.digest import attachments_digest
from tests.samples import code_zip, data_csv, docx_file, requirements_xlsx


def test_requirement_sheet_detected_with_title_row() -> None:
    att = build_attachment("a1", "yeu_cau.xlsx", requirements_xlsx())
    assert att.kind == "requirements" and len(att.requirements) == 4
    first = att.requirements[0]
    assert first.id == "FR-01" and first.text.startswith("Nhân viên hỏi đáp")
    assert first.priority == "Must" and first.category == "Hỏi đáp" and first.sheet == "Yêu cầu"


def test_data_sample_profile() -> None:
    att = build_attachment("a2", "sales.csv", data_csv(150))
    assert att.kind == "data_sample"
    profile = att.data_profiles[0]
    types = {c.name: c.dtype for c in profile.columns}
    assert types == {
        "ngay": "date",
        "doanh_thu": "number",
        "email_khach": "text",
        "ghi_chu": "empty",
    }
    email = next(c for c in profile.columns if c.name == "email_khach")
    assert email.pii_suspect and email.examples == []
    assert profile.rows == 150 and 1 <= profile.readiness_hint <= 5
    assert any("thiếu 100%" in i for i in profile.issues)


def test_small_dataset_lowers_readiness() -> None:
    assert build_attachment("a", "s.csv", data_csv(20)).data_profiles[0].readiness_hint <= 3


def test_docx_document() -> None:
    att = build_attachment("a3", "hien_trang.docx", docx_file("Có 800 văn bản quy định."))
    assert att.kind == "document" and "800 văn bản" in att.text and "SharePoint" in att.text


def test_code_profile_skips_vendor_dirs() -> None:
    profile = build_attachment("a4", "code.zip", code_zip()).code_profile
    assert profile is not None
    assert set(profile.languages) == {"Python", "TypeScript"}
    assert {"FastAPI", "React", "pandas"} <= set(profile.frameworks)
    assert profile.has_tests and profile.has_docker
    assert "node_modules" not in profile.top_dirs


@pytest.mark.parametrize(
    ("name", "data", "kind", "message"),
    [
        ("old.xls", b"x", None, ".xls cũ"),
        ("a.exe", b"x", None, "chưa hỗ trợ"),
        ("code.zip", code_zip(), "document", "chỉ dùng cho source code"),
        ("many.zip", code_zip(extra_files=5_001), None, "quá nhiều file"),
        ("big.pdf", b"x" * (20 * 1024 * 1024 + 1), None, "quá lớn"),
    ],
)
def test_rejects_invalid_attachments(name, data, kind, message) -> None:
    with pytest.raises(DocumentError, match=message):
        build_attachment("a", name, data, kind)


def test_forced_requirements_without_text_column() -> None:
    with pytest.raises(DocumentError, match="Không tìm thấy cột mô tả"):
        build_attachment("a", "data.csv", data_csv(), "requirements")


def test_digest_budgets_and_masks() -> None:
    attachments = [
        build_attachment("a1", "d.docx", docx_file("Liên hệ an@example.vn. " + "x" * 30_000)),
        build_attachment("a2", "r.xlsx", requirements_xlsx(60)),
        build_attachment("a3", "s.csv", data_csv()),
        build_attachment("a4", "c.zip", code_zip()),
    ]
    from app.privacy import mask_pii

    digest = attachments_digest(attachments, lambda t: mask_pii(t)[0])
    doc = digest["documents"][0]
    assert "[EMAIL_1]" in doc["text"] and len(doc["text"]) <= 16_000 and doc["truncated"]
    assert digest["requirements"]["count"] == 60 and len(digest["requirements"]["sample"]) == 40
    assert digest["data_samples"][0]["rows"] == 150
    assert digest["source_code"][0]["frameworks"]
    assert attachments_digest([], str) == {}


def test_japanese_requirement_list_headers() -> None:
    """Typical Japanese RFP list: 要件ID must not be taken for the text column, 要件内容 is the
    text, 要件名 is prefixed to it, a cover sheet without a table is skipped."""
    from openpyxl import Workbook

    wb = Workbook()
    wb.active.title = "表紙"
    wb.active.append(["要件一覧"])
    ws = wb.create_sheet("機能要件")
    ws.append(["No.", "要件ID", "大分類", "中分類", "要件名", "要件内容", "優先度", "備考"])
    ws.append(
        [
            1,
            "FR-QA-001",
            "検索・回答",
            "質問応答",
            "自然言語での質問応答",
            "日本語で質問できること",
            "必須",
            "",
        ]
    )
    ws.append(
        [2, "FR-QA-002", "検索・回答", "根拠", "根拠の提示", "参照ページを表示すること", "推奨", ""]
    )
    buffer = io.BytesIO()
    wb.save(buffer)
    att = build_attachment("a1", "要件一覧.xlsx", buffer.getvalue())
    assert att.kind == "requirements" and [r.id for r in att.requirements] == [
        "FR-QA-001",
        "FR-QA-002",
    ]
    first = att.requirements[0]
    assert first.text == "自然言語での質問応答: 日本語で質問できること"
    assert first.category == "検索・回答" and first.priority == "必須" and first.sheet == "機能要件"


def test_auto_detect_keeps_data_table_with_free_text_column() -> None:
    csv = "受付番号,発生日時,症状,処置内容\n" + "".join(
        f"MP-{i},2026/01/0{i % 9 + 1} 10:00,主軸異音,工具交換\n" for i in range(20)
    )
    auto = build_attachment("a1", "履歴.csv", csv.encode("utf-8"))
    assert auto.kind == "data_sample" and not auto.requirements
    forced = build_attachment("a2", "履歴.csv", csv.encode("utf-8"), "requirements")
    assert forced.kind == "requirements" and len(forced.requirements) == 20
