# Kịch bản demo ScopeAI (khoảng 5–6 phút)

**Thông điệp chính:** *ScopeAI rút thời gian phản hồi yêu cầu AI của khách từ vài ngày xuống vài phút, và biết nói "không cần AI" khi đó là câu trả lời đúng.*

## Chuẩn bị trước khi lên sân khấu

- [ ] Backend chạy với LLM thật (`LLM_PROVIDER` trong `backend/.env`), kiểm tra `curl http://127.0.0.1:8000/api/health`.
- [ ] Frontend mở sẵn trang **Tạo hồ sơ**, zoom trình duyệt 125% (Cmd +) cho dễ nhìn khi chiếu; chọn sáng/tối bằng nút ở góc dưới menu (nền sáng thường rõ hơn trên máy chiếu).
- [ ] Đã ghi replay bằng LLM thật: `python -m eval.record_replay --case case_01` (và `case_10`, `case_13`). Nếu mạng/API lỗi → dùng nút **Replay** ở cuối trang chủ, kịch bản không đổi.
- [ ] Đã chạy eval lần cuối (`python -m eval.run_eval --label "final"`) để trang **Đánh giá** có số liệu thật.
- [ ] Video quay sẵn kịch bản này để dự phòng.

## Kịch bản

| Thời điểm | Nội dung | Thao tác trên màn hình | Câu nói gợi ý |
| --- | --- | --- | --- |
| 0:00–0:30 | Vấn đề | Trang chủ | "Mỗi tuần presales nhận yêu cầu AI từ khách và phải chờ AI dev vài ngày mới trả lời được. Khảo sát nội bộ: trung bình … ngày/yêu cầu." |
| 0:30–2:00 | **Case 01** – khách Nhật cần chatbot manual | Bấm mẫu **Chatbot manual bảo trì** → **Phân tích**. Chỉ vào thanh tiến trình 8 bước và tab **Tổng quan** đầy dần theo từng bước. | "Email tiếng Nhật, agent tự nhận ra ngôn ngữ và ràng buộc on-prem." |
| | Hướng giải pháp | Tab **Giải pháp**: RAG, các hướng bị loại (fine-tune…) | "Agent không chỉ chọn, mà giải thích vì sao loại từng hướng." |
| | Effort bằng code | Cũng ở tab **Giải pháp**: khung **Công thức tính effort gốc** (bảng chuẩn × 1,3 on-prem × 1,15 tiếng Nhật) và sơ đồ kiến trúc | "Con số effort được tính bằng code từ bảng chuẩn, LLM chỉ giải thích và được lệch tối đa 20% kèm lý do." |
| | Song ngữ + duyệt | Tab **Proposal & hồ sơ**: bấm **Tiếng Việt** (bản dịch), rồi **Duyệt** ở góc phải trên | "Proposal viết bằng tiếng Nhật cho khách, có bản tiếng Việt cho team. AI dev duyệt mới được gửi." |
| 2:00–2:40 | **Hồ sơ đầy đủ** | Tạo phiên mới có tên dự án, khách hàng, hạn nộp, kèm 4 file trong `samples/`. Chỉ thẻ **Tài liệu khách cung cấp**, **WBS & timeline** (Gantt), **Chi phí dự kiến** (đổi VND→JPY), **Đáp ứng yêu cầu**; bấm **Tải trọn bộ (.zip)** với slide JA rồi mở `.pptx` | "Từ email và file khách gửi, presales có ngay slide, Word, Excel, báo giá sơ bộ, kể cả bản tiếng Nhật." |
| 2:30–3:00 | **Case 10** – "dùng AI tính tổng hóa đơn" | Mẫu **Tính tổng hóa đơn Excel** → **Phân tích** | Để khoảng lặng khi banner **"Không cần AI cho bài toán này"** hiện ra. "Một script là đủ: rẻ hơn, nhanh hơn, đúng 100%." |
| 2:45–3:30 | **Case 13** – yêu cầu mơ hồ | Mẫu **Yêu cầu mơ hồ** → agent dừng ở bước 2, câu hỏi **Bắt buộc** màu đỏ. Bấm **Soạn email gửi khách** và **Tải Q&A sheet**; điền nhanh 2 câu trả lời → **Tiếp tục phân tích** | "Agent hỏi lại thay vì đoán, và soạn sẵn email cho presales gửi khách." |
| 3:30–4:00 | Human-in-the-loop | Bấm **Yêu cầu sửa** ở góc phải trên, gõ "Khách đồng ý dùng cloud", chọn bước 5 → **Chạy lại từ bước 5**; huy hiệu **Bản sửa #1** | "AI dev sửa hướng chỉ bằng một câu góp ý, agent chạy lại đúng các bước cần thiết." |
| 4:00–4:30 | Bảo mật | Chỉ huy hiệu **Đã ẩn … trước khi gửi LLM** ở đầu trang kết quả | "Email, số điện thoại của khách được che trước khi rời hệ thống." |
| 4:30–4:45 | **Quản lý hồ sơ** | Trang **Lịch sử**: hạn nộp, giai đoạn deal, giờ tiết kiệm | "Đây là công cụ presales dùng hằng ngày, không chỉ là demo AI." |
| 4:45–5:30 | **Chuẩn công ty & quy trình** | Tab **Kế hoạch & báo giá**: đổi **Trọn gói → T&M → ODC**, dòng overhead PM/BrSE. Tab **Quy trình & phê duyệt**: Bid/No-bid (điểm 93/100), **Duyệt giá**, **Chốt phiên bản v1.0**. **Cài đặt → Template**: chọn *Template công ty mẫu* rồi tải slide/Word: logo, màu, chân trang, case study, điều khoản chuẩn tự vào hồ sơ | "Hồ sơ ra đúng template, đúng bảng giá, đúng quy trình duyệt của công ty; công ty chỉ cần upload template thật." |
| 5:30–6:00 | **Bằng chứng** | Trang **Đánh giá**: pattern accuracy, topic recall, schema success, biểu đồ qua các phiên bản prompt | "30 case giả lập, đo sau mỗi lần chỉnh prompt." |

## Câu hỏi Q&A thường gặp

- **Effort tính thế nào?** Bảng chuẩn theo pattern × giai đoạn (`backend/knowledge_base/estimation_template.yaml`) nhân hệ số on-prem, tiếng Nhật, độ sẵn sàng dữ liệu, tuân thủ. Code tính, LLM không tự sinh số.
- **Sai thì sao?** Mọi kết luận có lý do và độ tự tin; AI dev review, sửa tay proposal hoặc chạy lại từ bất kỳ bước nào với góp ý; chỉ khi bấm Duyệt mới có trạng thái `approved`.
- **Bảo mật dữ liệu khách?** Che PII trước khi gửi LLM, có thể chạy on-prem với endpoint OpenAI-compatible nội bộ; KB nạp trực tiếp, không cần vector DB bên ngoài.
- **Chất lượng đo thế nào?** 30 case giả lập phủ đủ 6 pattern và 3 ngôn ngữ; metric: pattern accuracy, topic recall, estimate in range, schema success, latency (`docs/eval_summary.md`).
- **Template công ty thật?** Bộ mẫu “Công ty ABC (mẫu)” chỉ minh họa. Tải về ở **Cài đặt → Template**, thay logo/màu/bố cục rồi upload lại; hệ thống kiểm tra file và báo cảnh báo trước khi dùng.
- **Báo giá có tin được không?** Toàn bộ số tiền do code tính từ WBS × bảng đơn giá (số giả lập); có overhead, onsite, 3 mô hình hợp đồng, và phải qua bước **Duyệt giá** trước khi hồ sơ “Sẵn sàng gửi”.
- **LLM chết lúc demo?** Tự thử lại lỗi mạng; nếu vẫn lỗi dùng chế độ Replay đã ghi từ run thật.
