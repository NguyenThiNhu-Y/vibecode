# Bộ hồ sơ RFP mẫu: Trợ lý AI tri thức bảo trì thiết bị (khách Nhật)

> Toàn bộ là **giả lập**: công ty 株式会社東海ミナトテック (Tokai Minato Tech), hãng máy 株式会社コウヨウ工機, tên người, email (`.example`), số điện thoại, số liệu. Cấu trúc và nội dung được soạn theo RFP thực tế của doanh nghiệp sản xuất Nhật gửi cho các công ty outsourcing.

## Kịch bản

Một nhà sản xuất linh kiện ô tô ở Aichi (2 nhà máy ở Nhật + 1 nhà máy ở Bắc Ninh) gửi RFP cho nhiều vendor: muốn xây **trợ lý AI trả lời câu hỏi bảo trì thiết bị** dựa trên manual, tiêu chuẩn bảo trì và lịch sử sự cố, trả lời bằng **tiếng Nhật và tiếng Việt**, chạy trong **Azure của khách (Japan East)**, làm **PoC 3 tháng** trước rồi mới phát triển chính thức. Đây là dạng RFP AI phổ biến nhất mà các công ty Việt Nam nhận từ Nhật hiện nay.

## Các file

| File | Loại khi đính kèm | Nội dung |
|---|---|---|
| `email_yeu_cau_khach.txt` | Nội dung yêu cầu (dán vào ô nhập) | Email mời chào giá của phòng DX, tóm tắt bối cảnh, phạm vi, điều kiện, lịch, ngân sách PoC, danh sách file. Có email và số điện thoại trong chữ ký → ScopeAI che PII. |
| `RFP_設備保全ナレッジAI_v1.0.docx` | Tài liệu | 提案依頼書 15 mục: 背景・課題 (bảng 5 vấn đề có số liệu), KPI mục tiêu, phạm vi (3 nhà máy, 230 người, 5 loại dữ liệu), ngoài phạm vi, hệ thống hiện tại (M365, Entra ID, Azure, hệ thống bảo trì tự phát triển MAINTE-PRO), 3 phase, lịch đấu thầu, 10 nội dung yêu cầu trong proposal, ngân sách, 契約形態, 評価基準 (điểm), cách nộp. |
| `別紙1_要件一覧_v1.0.xlsx` | Requirement | **41 requirement**: sheet 機能要件 (25) + 非機能要件 (16), cột No. / 要件ID / 大分類 / 中分類 / 要件名 / 要件内容 / 優先度 (必須・推奨・任意) / 備考, kèm 2 cột vàng để vendor điền ○△× và giải thích, sheet 表紙 có hướng dẫn và lịch sử sửa đổi. |
| `別紙2_故障履歴サンプル_2025-2026.csv` | Data mẫu | **600 sự cố** trích từ hệ thống bảo trì (UTF-8 BOM, mở được bằng Excel). Trộn tiếng Nhật và tiếng Việt (nhà máy Bắc Ninh), có lỗi dữ liệu như thật: mã lỗi ghi lệch (`AL2047`, `al-2047`), 23% thiếu nguyên nhân, xử lý ghi cụt ("済", "OK"), cột email người xử lý (dữ liệu cá nhân). |
| `別紙3_MC-850H_取扱説明書_保守編_抜粋.pdf` | Tài liệu | 4 trang trích manual máy phay CNC: bảng kiểm tra hằng ngày, bảng mã lỗi AL-xxxx (khớp với mã trong CSV), quy trình xử lý tiếng kêu trục chính (ngưỡng rung 2,8 mm/s), quy trình về gốc ATC. |
| `pack.json` | — | Thông tin để nút **Bộ hồ sơ RFP mẫu** trên trang Tạo hồ sơ tự nạp email, tên dự án, khách, hạn nộp (30/10/2026) và 4 file. |
| `case.yaml` | — | Để ghi replay bằng LLM thật (xem cuối file). |

## Bản dịch email (để người trình bày nắm nội dung)

> **Tiêu đề:** [Yêu cầu đề xuất] Xây dựng trợ lý AI tri thức bảo trì thiết bị (gửi RFP)
>
> Kính gửi các đơn vị được mời đề xuất. Tôi là Sato, phòng DX, Tokai Minato Tech (giả lập). Công ty đang lên kế hoạch xây dựng "trợ lý AI tri thức bảo trì thiết bị" hỗ trợ công việc bảo trì tại nhà máy, xin mời quý công ty gửi đề xuất. Chi tiết xem RFP và các phụ lục đính kèm.
>
> **Bối cảnh, mục tiêu:** nhân sự bảo trì giàu kinh nghiệm lần lượt nghỉ hưu, dự kiến 5 năm tới khoảng 30% đến tuổi hưu. Điều tra nguyên nhân khi máy dừng mất nhiều thời gian: năm 2025 trung bình 74 phút mỗi lần dừng máy, trong đó khoảng 40% dành để tra manual và sự cố cũ. Nhà máy Bắc Ninh chỉ có manual tiếng Nhật nên phát sinh khoảng 120 câu hỏi kỹ thuật mỗi tháng gửi về Nhật. Mục tiêu: trợ lý AI trả lời bằng tiếng Nhật và tiếng Việt dựa trên manual, tiêu chuẩn bảo trì và lịch sử sự cố, **giảm 20% thời gian dừng máy trung bình và giảm một nửa số câu hỏi gửi về Nhật**.
>
> **Phạm vi:** nhà máy Toyohashi, Kariya (Aichi) và Bắc Ninh; khoảng 230 người dùng (150 Nhật, 80 Việt Nam); khoảng 2.300 file tài liệu (~48.000 trang, ước tính ~30% là PDF scan); khoảng 62.000 bản ghi sự cố (từ 2015, trộn tiếng Nhật và tiếng Việt).
>
> **Điều kiện chính:** mọi dữ liệu, log nằm trong Azure tenant của công ty (vùng Japan East) và không bị dùng để huấn luyện mô hình; đăng nhập một lần bằng Microsoft Entra ID; làm PoC trước (3 tháng, giới hạn nhóm máy phay CNC ở Toyohashi), dựa trên kết quả mới phát triển chính thức; **ngân sách PoC tối đa 15 triệu yên (chưa thuế)**.
>
> **Lịch:** nhận câu hỏi đến 17:00 ngày 14/10/2026; hạn nộp đề xuất 17:00 ngày 30/10/2026; thuyết trình trong tuần 9–13/11/2026; dự kiến bắt đầu PoC tháng 12/2026.

## Những điểm mở (presales giỏi sẽ hỏi, ScopeAI nên phát hiện)

Bộ hồ sơ cố ý giữ những điểm chưa rõ như RFP thật, để thấy bước *Câu hỏi làm rõ* và *Rủi ro* làm việc:

1. **Tỉ lệ PDF scan chỉ là ước tính ("約3割", "未調査")**, có chú thích viết tay → OCR là hạng mục effort và rủi ro lớn nhất, chưa định lượng được.
2. **Khách yêu cầu vendor tự đề xuất mục tiêu độ chính xác**, bộ 300 câu hỏi đánh giá chỉ có sau khi PoC bắt đầu 1 tháng → rủi ro nghiệm thu.
3. **MAINTE-PRO chưa có API ghi** (`FR-HIS-004` ghi "未整備", spec chỉ mở sau NDA) → nên tách khỏi phạm vi PoC.
4. **Ràng buộc dữ liệu**: Azure Japan East, không dùng dữ liệu để train → loại các API LLM bên ngoài; cần xác nhận model nào có sẵn ở Japan East.
5. **Song ngữ**: tài liệu gốc chỉ có tiếng Nhật nhưng phải trả lời tiếng Việt; từ điển 1.200 thuật ngữ chỉ giao khi bắt đầu PoC.
6. **24/7 và 99,5%** (nhà máy Bắc Ninh làm 3 ca) → chi phí vận hành, phạm vi hỗ trợ ngoài giờ.
7. **Hợp đồng**: PoC là 準委任 (gần với T&M), phát triển chính thức là 請負 (trọn gói) → trên ScopeAI nên thử chuyển báo giá T&M cho PoC.
8. **Ngân sách PoC 15 triệu yên** → so với báo giá ScopeAI tính ra (đổi tiền tệ sang JPY).

## Kết quả nên thấy khi chạy

- Ngôn ngữ khách: **ja** → câu hỏi làm rõ, email và Q&A sheet viết bằng tiếng Nhật; slide có bản JA; báo giá có thêm **BrSE**; tiền tệ JPY.
- Hướng giải pháp: **RAG** (có trích dẫn nguồn, phân quyền tài liệu), loại fine-tune / classic ML (dự báo bảo trì nằm ngoài phạm vi).
- Bảng đáp ứng: đủ **41 dòng** theo đúng mã 要件ID của khách.
- Data mẫu: 600 dòng, phát hiện cột email là dữ liệu cá nhân; email, số điện thoại trong email khách bị che trước khi gửi LLM.

Kết quả cụ thể phụ thuộc model LLM; số liệu effort, lịch và báo giá do code tính.

## Chạy với OpenRouter (tiết kiệm lượt gọi)

1. Trong `backend/.env`: dán key đầy đủ vào `OPENROUTER_API_KEY=` và đổi `LLM_PROVIDER=openrouter`. Khởi động lại backend.
2. Trang **Tạo hồ sơ** → khung **Bộ hồ sơ RFP mẫu** → bấm **RFP trợ lý AI bảo trì nhà máy (Nhật)** → **Phân tích**.
3. Mỗi lần phân tích đầy đủ bộ này gọi LLM khoảng **10 lần** (8 bước, bước đáp ứng yêu cầu chia 2 lô vì có 41 requirement). Xuất slide tiếng Nhật, soạn email khách, dịch proposal gọi thêm 1–2 lần mỗi việc.
4. Response hợp lệ được lưu ở `backend/llm_cache/<bước>/*.json`. **Chạy lại cùng email, cùng file, cùng model thì không tốn lượt nào.** Sửa một prompt hay đổi model thì chỉ các bước bị ảnh hưởng gọi lại. Muốn ép gọi lại một bước: xóa thư mục của bước đó trong `llm_cache/`.
5. Gói free của OpenRouter: 50 lượt/ngày nếu chưa nạp tiền (khoảng 4–5 lần chạy bộ này), 1.000 lượt/ngày nếu đã nạp từ 10 USD.

Ghi replay để demo offline (sau khi đã chạy một lần, phần lớn đọc từ cache):

```bash
cd backend
python -m eval.record_replay --case ../samples/rfp_tokai_minato/case.yaml --attach \
  ../samples/rfp_tokai_minato/RFP_設備保全ナレッジAI_v1.0.docx \
  ../samples/rfp_tokai_minato/別紙1_要件一覧_v1.0.xlsx \
  ../samples/rfp_tokai_minato/別紙2_故障履歴サンプル_2025-2026.csv \
  ../samples/rfp_tokai_minato/別紙3_MC-850H_取扱説明書_保守編_抜粋.pdf
```

Replay giữ đúng thời gian chờ của lần gọi LLM thật, kể cả khi các bước được đọc từ cache.
