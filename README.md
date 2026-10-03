# ScopeAI

ScopeAI nhận yêu cầu AI thô của khách hàng (email/RFP bằng tiếng Việt, Anh hoặc Nhật) cùng tài liệu đính kèm (Excel requirement, PDF/DOCX, data mẫu, source code) và chạy một pipeline LLM 8 bước để trả về **bộ hồ sơ proposal sơ bộ** trong vài phút: thông tin trích xuất, câu hỏi làm rõ, hướng giải pháp (kể cả *"không cần AI"*), đánh giá khả thi và rủi ro, kiến trúc và effort, WBS và timeline, bảng đáp ứng yêu cầu, proposal; xuất ra slide `.pptx`, Word `.docx`, Excel `.xlsx`. AI dev chỉ cần review và bấm duyệt.

> Toàn bộ dữ liệu mẫu, test case và dự án tham chiếu là **giả lập**.

## Kiến trúc

```
Trình duyệt (React + Vite + Tailwind)
   │  REST + Server-Sent Events
   ▼
FastAPI ── pipeline 8 bước ── LLMClient ── mock | openai-compatible | VibeFlow
   │          │
   │          ├─ prompts/*.md            (mỗi bước một prompt)
   │          ├─ knowledge_base/*.yaml   (nạp thẳng vào prompt, không vector DB)
   │          └─ compute_estimates()     (effort gốc tính bằng code)
   ▼
SQLite (bảng runs)
```

| Bước | Việc làm | Ghi chú kỹ thuật |
| --- | --- | --- |
| 1. `intake` | Trích xuất thông tin có cấu trúc | Không suy diễn, thiếu thì `null` |
| 2. `gaps` | Câu hỏi làm rõ (≤ 7) | Có câu *blocking* → dừng ở `waiting_clarification` |
| 3. `pattern` | Chọn hướng giải pháp | Xét `no_ai_rule_based` đầu tiên |
| 4. `feasibility` | Chấm điểm 1–5, rủi ro | Rủi ro sắp theo severity |
| 5. `architecture` | Component, deployment, effort | Effort = bảng chuẩn × hệ số (code); LLM chỉ được lệch ±20% kèm lý do |
| 6. `wbs` | Chia công việc theo giai đoạn | Code kiểm tra tổng ngày công khớp effort, rồi tự tính timeline (Gantt) |
| 7. `requirements` | Bảng đáp ứng từng requirement của khách | Chia lô 40 dòng; code kiểm tra không thiếu, không thừa dòng nào |
| 8. `proposal` | Proposal Markdown | Bắt buộc có mục *Giả định* và *Rủi ro* |

Trước 8 bước, các file khách gửi được **phân tích bằng code** (`backend/app/ingest/`): Excel requirement → danh sách requirement; data mẫu → profile cột, % trống, cột nghi PII, điểm sẵn sàng dữ liệu; source code .zip → ngôn ngữ, framework, số dòng; PDF/DOCX → văn bản. Chỉ bản tóm tắt (đã che PII, giới hạn độ dài) được đưa vào LLM.

Mỗi bước đi qua `Step` (`backend/app/agents/step.py`): ghép prompt + kiến thức + JSON Schema → gọi LLM → bóc JSON → validate Pydantic → kiểm tra riêng của bước → retry tối đa 2 lần kèm thông báo lỗi.

### Giao diện

Giao diện kiểu app làm việc, mặc định nền sáng, có nút chuyển sáng/tối ở góc dưới menu. Mỗi hồ sơ có 7 tab: Tổng quan · Yêu cầu & câu hỏi · Giải pháp · Kế hoạch & báo giá · Đáp ứng yêu cầu · Proposal & hồ sơ · Quy trình & phê duyệt.

### Tính năng

- **Đầu vào:** dán email/RFP và đính kèm tối đa 10 file: Excel requirement (`.xlsx`/`.csv`), tài liệu (`.pdf`, `.docx`, `.txt`, `.md`), data mẫu (`.csv`/`.xlsx`), source code (`.zip`); tiếng Việt, Anh, Nhật.
- **Bộ hồ sơ xuất ra (bằng code):** slide `.pptx` (sơ đồ kiến trúc + Gantt là shape chỉnh sửa được), Word `.docx` (proposal + phụ lục), Excel `.xlsx` (effort có công thức, WBS, timeline, bảng đáp ứng yêu cầu, rủi ro), gói `.zip` trọn bộ; tải sơ đồ kiến trúc SVG/PNG.
- **WBS & timeline:** tổng ngày công được code đối chiếu với effort; Gantt tính bằng code từ phụ thuộc giữa các đầu việc.
- **Bảng đáp ứng yêu cầu:** từng dòng requirement của khách được đánh giá Đáp ứng / Một phần / Không đáp ứng / Cần làm rõ.
- **Báo giá sơ bộ theo chuẩn công ty (bằng code):** ngày công WBS + overhead quản lý (PM 10%, BrSE 15% khi khách Nhật) × đơn giá theo vai trò, pha trộn offshore/onsite; 3 mô hình hợp đồng **Trọn gói** (dự phòng theo rủi ro + mốc thanh toán), **T&M** (thanh toán theo tháng), **ODC** (đội FTE × tháng); chi phí vận hành/tháng; đổi VND/JPY/USD; có trong slide, Word, Excel (công thức).
- **Template công ty:** slide, Word, Excel ước tính và Excel Q&A xuất theo template của công ty: bộ **template mẫu trung tính** (“Công ty ABC (mẫu)”, sinh bằng code) hoặc **upload template riêng** (kiểm tra trước khi dùng). Logo, màu, header/footer, trang bìa lấy từ template; ScopeAI điền `{{company_name}}`, `{{client_name}}`, `{{project_name}}`, `{{version}}`… và vẽ nội dung vào vùng `{{SCOPEAI_CONTENT}}` / `{{SCOPEAI_BODY}}`, Excel ghi theo cấu hình sheet/cột.
- **Thư viện nội dung chuẩn & case study:** giới thiệu công ty, phương pháp, bảo mật, bảo hành, điều khoản được chèn nguyên văn theo ngôn ngữ khách; tối đa 3 case study *được phép trình bày* tự chọn theo hướng giải pháp, thị trường, ngành.
- **Quy trình presales:** checklist **Bid/No-bid** (code gợi ý từ kết quả phân tích, presales xác nhận), **phê duyệt 2 cấp** (AI dev duyệt kỹ thuật, quản lý duyệt giá; giá đã duyệt thì khóa), **phiên bản gửi khách** (1.0 → 1.1 → 2.0, lưu snapshot), **tên file theo quy tắc công ty** (`ABC_KhachHang_DuAn_Proposal_v1.0_20261003.docx`).
- **Gửi câu hỏi cho khách:** email nháp bằng ngôn ngữ của khách (tên khách do code điền, không gửi LLM), Q&A sheet Excel, nhập lại file khách đã điền để agent chạy tiếp.
- **Quản lý hồ sơ presales:** tên dự án, khách hàng, hạn nộp (cảnh báo sắp đến hạn), giai đoạn deal (Mới → Đang hỏi khách → Chờ duyệt → Sẵn sàng gửi → Đã gửi → Thắng/Thua, hoặc Không tham gia); tìm kiếm, lọc, sắp xếp; tỉ lệ thắng và giờ tiết kiệm ước tính; gợi ý hồ sơ cũ tương tự.
- **Trang Cài đặt:** thông tin công ty và quy tắc đặt tên file, template, nội dung chuẩn, case study, đơn giá (offshore/onsite, overhead, hợp đồng mặc định), bảng effort chuẩn, tiêu chí Bid/No-bid, dự án tham chiếu, sửa ngay trên web (có kiểm tra dữ liệu). Toàn bộ số liệu mặc định là **giả lập**; template mẫu không dùng nhận diện của công ty thật.
- **Slide theo ngôn ngữ khách:** VI / EN / JA.
- **Hỏi lại thay vì đoán:** dừng ở bước 2 khi thiếu thông tin quyết định, người dùng trả lời rồi chạy tiếp.
- **Effort minh bạch:** hiển thị công thức bảng chuẩn × hệ số (on-prem, tiếng Nhật, dữ liệu, tuân thủ).
- **Sơ đồ kiến trúc** Mermaid sinh tự động.
- **Compliance theo thị trường** VN (Nghị định 13/2023), JP (APPI, hướng dẫn y tế), EU (GDPR, AI Act).
- **Human-in-the-loop:** duyệt / yêu cầu sửa, **chạy lại từ một bước theo góp ý**, **sửa proposal trực tiếp**.
- **Proposal song ngữ:** dịch sang Việt / Anh / Nhật khi bấm, có cache.
- **Bảo mật:** che email, số điện thoại, link trước khi gửi LLM.
- **Ổn định:** tự thử lại lỗi mạng/HTTP tạm thời; run kẹt được khôi phục khi khởi động lại server; chế độ Replay khi mất mạng.
- **Lịch sử, so sánh 2 phiên, trang Đánh giá** với biểu đồ chất lượng qua các phiên bản prompt.

Spec chi tiết và contract API: [AGENTS.md](AGENTS.md).

## Cách chạy

Yêu cầu: Python ≥ 3.11, Node ≥ 20.

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env            # mặc định LLM_PROVIDER=mock, chạy được không cần API key
uvicorn app.main:app --reload --port 8000

# Frontend (terminal khác)
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

Nếu cổng 8000 đã bị chiếm (ví dụ bởi Docker), chạy backend ở cổng khác và trỏ frontend tới đó:

```bash
uvicorn app.main:app --port 8010
VITE_API_BASE=http://127.0.0.1:8010/api npm run dev
```

### Chọn LLM

Trong `backend/.env`:

| `LLM_PROVIDER` | Hành vi |
| --- | --- |
| `mock` | Trả JSON mẫu trong `tests/fixtures/` (có kịch bản riêng cho yêu cầu "Excel" → không cần AI, và "năng suất" → cần làm rõ) |
| `openai` | Gọi `POST {LLM_BASE_URL}/chat/completions` (mọi endpoint OpenAI-compatible) |
| `vibeflow` | Chưa cài đặt: cần bổ sung cách gọi VibeFlow trong `app/llm/vibeflow.py` |

`PII_MASKING=true` (mặc định) che email/số điện thoại/link trước khi gửi LLM; `LLM_MAX_RETRIES` đặt số lần thử lại khi lỗi mạng.

## Kiểm thử và evaluation

```bash
cd backend
pytest -q                                   # unit test, không gọi LLM thật
ruff check . && ruff format --check .       # lint
python -m eval.run_eval                     # chạy toàn bộ eval/cases/*.yaml với LLM trong .env
python -m eval.run_eval --case case_01      # một case
python -m eval.run_eval --label "prompt v2" # gắn nhãn phiên bản prompt
python -m eval.summary                      # cập nhật docs/eval_summary.md
```

Report được ghi vào `backend/eval/reports/eval_<MMDD_HHMM>.json` và `.md`, gồm: pattern accuracy, question topic recall, estimate in range (MVP), schema success rate (tỉ lệ bước không cần retry), latency trung bình. Xem trực quan ở trang **Đánh giá** (`/eval`). Bộ test có 30 case giả lập (`backend/eval/cases/`) phủ 6 pattern và 3 ngôn ngữ.

## Chế độ Replay (demo khi mất mạng)

```bash
cd backend
python -m eval.record_replay --case case_01   # ghi lại run thật vào backend/replays/case_01.json
python -m eval.record_replay --case case_02 --attach ../samples/*  # replay kèm file đính kèm
```

Mở `http://localhost:5173/replay/case_01` (hoặc bấm nút Replay ở trang chủ). Case cần làm rõ (`case_13`) được ghi thành 2 đoạn: dừng hỏi lại → điền sẵn `demo_answers` → chạy tiếp.

Ba file replay có sẵn trong repo được ghi bằng `LLM_PROVIDER=mock`. **Hãy ghi lại bằng LLM thật trước khi demo.** Kịch bản demo chi tiết: [docs/demo_script.md](docs/demo_script.md).

## Giới hạn

- Không có đăng nhập/phân quyền, chỉ dành cho một người dùng tại một thời điểm, chưa deploy cloud.
- Knowledge base, bảng effort và prompt hiện là **bản nháp**, cần chuyên gia review và tinh chỉnh dựa trên kết quả eval.
- Đáp án kỳ vọng của 30 case eval là bản nháp, cần chuyên gia review.
- Chưa hỗ trợ OCR cho PDF dạng ảnh scan.
- Proposal là bản nháp, luôn cần AI dev duyệt (human-in-the-loop).
- Template riêng của công ty cần theo quy ước layout/marker (xem Cài đặt → Template); template quá khác chuẩn vẫn xuất được nhưng có thể cần chỉnh tay. Trước khi dùng logo/template thật của công ty trong bài dự thi, cần kiểm tra quy định bảo mật của công ty và ban tổ chức.
- Nếu server dừng đột ngột giữa lúc chạy, run có thể kẹt ở trạng thái `running` (ngắt kết nối thông thường thì run được đưa về `created` để chạy tiếp).
