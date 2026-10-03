from app.privacy import mask_pii


def test_masks_email_phone_url_with_stable_placeholders() -> None:
    text = (
        "Liên hệ nam@example.vn hoặc 0901 234 567, +81 3-1234-5678. "
        "Gửi lại nam@example.vn. Xem https://fake.example.com/rfp."
    )
    masked, counts = mask_pii(text)
    assert "nam@example.vn" not in masked and "0901" not in masked and "https" not in masked
    assert masked.count("[EMAIL_1]") == 2
    assert "[PHONE_1]" in masked and "[PHONE_2]" in masked
    assert masked.endswith("[URL_1].")
    assert counts == {"url": 1, "email": 1, "phone": 2}


def test_keeps_numbers_that_are_not_phones() -> None:
    text = "Ngân sách 500.000.000 VND, 2,000ページ, hạn 16/10/2026, 40 file, mã đơn 1234567."
    assert mask_pii(text) == (text, {})
