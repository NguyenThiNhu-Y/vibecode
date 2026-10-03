import pytest

from app.documents import DocumentError, extract_text


def make_pdf(text: str) -> bytes:
    """Build a minimal one-page PDF whose content stream draws `text` (ASCII only)."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    )
    return bytes(out)


PDF_TEXT = "We need a chatbot over 2000 pages of maintenance manuals for our engineers."


def test_extracts_pdf_text() -> None:
    result = extract_text("rfp.pdf", make_pdf(PDF_TEXT))
    assert "maintenance manuals" in str(result["text"])
    assert result["pages"] == 1 and result["truncated"] is False


def test_reads_utf8_and_shift_jis_text() -> None:
    assert extract_text("a.txt", "Yêu cầu tiếng Việt có dấu".encode())["text"] == (
        "Yêu cầu tiếng Việt có dấu"
    )
    assert extract_text("b.md", "保守マニュアル".encode("shift_jis"))["text"] == "保守マニュアル"


def test_truncates_long_text() -> None:
    result = extract_text("long.txt", ("x" * 25_000).encode())
    assert result["truncated"] is True and len(str(result["text"])) == 20_000


@pytest.mark.parametrize(
    ("name", "data", "message"),
    [
        ("a.exe", b"x", "Chỉ hỗ trợ"),
        ("bad.docx", b"x", "File Word"),
        ("scan.pdf", make_pdf(""), "bản scan"),
        ("broken.pdf", b"not a pdf", "PDF bị lỗi"),
        ("big.txt", b"x" * (10 * 1024 * 1024 + 1), "quá lớn"),
    ],
)
def test_rejects_bad_files(name: str, data: bytes, message: str) -> None:
    with pytest.raises(DocumentError, match=message):
        extract_text(name, data)
