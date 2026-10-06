# Bộ hồ sơ bidding mẫu (dữ liệu mock)

Xuất từ replay `case_02` (trợ lý hỏi đáp quy định nội bộ ngân hàng, giả lập, kèm 4 file trong `samples/`) với `LLM_PROVIDER=mock`, ngày 05/10/2026.

| File | Nội dung |
| --- | --- |
| `mau_mock_bidding.xlsx` | Q&A · WBS 3 cấp (tổng là công thức) · Summary Phase × Type · Master Schedule theo tuần |
| `mau_mock_slides_vi.pptx` | Slide proposal (thiết kế builtin): WBS, master schedule có milestone, đội ngũ theo Type |
| `mau_mock_proposal.docx` | Proposal Word, phụ lục WBS + milestone |

**Lưu ý:** mock LLM trả cùng một kết quả cho mọi yêu cầu, nên các file này chỉ để xem **bố cục và công thức**, không phản ánh chất lượng phân tích. Câu chữ của task, câu hỏi và giả định sẽ khác hẳn khi chạy bằng LLM thật.

Tạo lại sau khi có LLM thật: chạy một hồ sơ trên giao diện rồi bấm **Tải bộ bidding (.xlsx)** ở tab *Kế hoạch & báo giá*, hoặc gọi `GET /api/runs/{id}/bidding.xlsx`.
