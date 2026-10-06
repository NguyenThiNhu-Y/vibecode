# BIDDING\_SPEC.md – Mở rộng ScopeAI: bộ tài liệu bidding

Oct 5, 2026 · @NhuY

## 0. Cách dùng file này

File này mở rộng `AGENTS.md`, không thay thế nó: mọi quy tắc, contract và cấu trúc repo trong `AGENTS.md` vẫn giữ nguyên, trừ chỗ nào file này ghi rõ là thay đổi.

1. Export ra Markdown, lưu thành `docs/BIDDING_SPEC.md` trong repo.
2. Thêm vào cuối `AGENTS.md` một dòng: `Phần mở rộng bidding: xem docs/BIDDING_SPEC.md (task B01–B10, làm sau T10).`
3. Bắt đầu các task B sau khi T10 (API và SSE) đã xong; B09 (giao diện) làm sau T14.
4. Giao việc bằng prompt mẫu ở mục 7 của `AGENTS.md`, thay `AGENTS.md` bằng `AGENTS.md và docs/BIDDING_SPEC.md`.

Thứ tự ưu tiên nếu thiếu thời gian trước 16/10: WBS + Q&A Excel (B01–B04, B06) là phần "ăn tiền" nhất; slide PowerPoint (B05, B07) có thể để vòng sau.

## 1. Mục tiêu và đầu ra

Sau phần mở rộng, mỗi run của ScopeAI sinh ra bản nháp của bốn tài liệu presales cần cho một buổi bidding, để presales và AI dev chỉ còn review và chỉnh sửa.

| Tài liệu | Định dạng xuất | Nguồn dữ liệu | Ai sinh ra |
| --- | --- | --- | --- |
| Q&A list | Sheet `Q&A` trong file `bidding_<run_id>.xlsx` | `gaps.questions` (đã có) | LLM (bước gaps) |
| WBS | Sheet `WBS` + `Summary` trong cùng file Excel | Bước mới `wbs` | LLM sinh task, code kiểm tra và cộng tổng |
| Master schedule | Sheet `Master Schedule` (Gantt theo tuần) + Mermaid gantt | Bước mới `schedule` | **Code thuần**, không dùng LLM |
| Slide proposal | `proposal_<run_id>.pptx`, 16:9, 12 phần | Bước `proposal` đổi thành `deck` | LLM viết nội dung, code dựng slide |

**Nguyên tắc giữ nguyên từ AGENTS.md:** số liệu (man-day, ngày tháng, tổng effort) do code tính hoặc kiểm tra, LLM không tự bịa; mọi dữ liệu mẫu là giả lập.

**Dependency mới được phép:** `openpyxl` (Excel), `python-pptx` (PowerPoint). Bổ sung vào mục 3.1 của `AGENTS.md`.

## 2. Thay đổi pipeline

Pipeline tăng từ 6 lên 8 bước: thêm `wbs` và `schedule` sau `architecture`, và đổi `proposal` thành `deck`. Đây là **thay đổi contract** so với AGENTS.md mục 4.

| # | StepName | Loại | Thay đổi |
| --- | --- | --- | --- |
| 1 | `intake` | LLM | Không đổi |
| 2 | `gaps` | LLM | Thêm trường `priority` cho câu hỏi (mục 3.1) |
| 3 | `pattern` | LLM | Không đổi |
| 4 | `feasibility` | LLM | Không đổi |
| 5 | `architecture` | LLM | Không đổi; `estimates` vẫn là mức tổng theo giai đoạn |
| 6 | `wbs` | LLM + code kiểm tra | **Mới.** Chia công việc thành task/sub-task có type, priority, estimate |
| 7 | `schedule` | Code thuần | **Mới.** Tính master schedule và milestone từ WBS + cấu hình team |
| 8 | `deck` | LLM + code dựng slide | **Thay `proposal`.** Nội dung 12 phần slide + tiêu chí nghiệm thu cho từng milestone |

### 2.1 Bước `wbs`

- **Context:** `intake`, `pattern`, `feasibility`, `architecture`, `computed_estimates`, `answers`.
- **KB mới:** `knowledge_base/wbs_templates.yaml`: khung task chuẩn theo từng pattern và danh sách task bắt buộc (mục 3.2). **\[Người\]** điền nội dung, AI tạo khung.
- **Phạm vi:** WBS cho giai đoạn `poc` và `mvp`; `production` chỉ có task mức tổng (không sub-task).
- **`post_validate` trong code:**
  - `id` duy nhất, dạng phân cấp `1`, `1.1`, `1.1.1`; sub-task phải có task cha.
  - Chỉ node lá có `estimate_md`; node cha = tổng con, **do code tính lại** và ghi đè.
  - `depends_on` chỉ trỏ tới id có thật, không tạo vòng.
  - Có ít nhất một node lá mỗi type `PM` và `QA` trong mỗi giai đoạn.
  - Pattern khác `no_ai_rule_based`: phải có task `tag = data_prep` và `tag = evaluation`.
  - Tổng effort mỗi giai đoạn phải nằm trong `[min × 0.8, max × 1.2]` của `computed_estimates`; nếu không, `adjustment_note` của giai đoạn đó bắt buộc có.
  - Không node lá nào > 10 man-day (quá lớn thì phải tách).

### 2.2 Bước `schedule`

Không gọi LLM. Nhận `wbs` và `ScheduleConfig` (ngày bắt đầu, số người theo type), chạy thuật toán mục 4. Vẫn phát `step_started` / `step_done` như bước thường để giao diện đồng nhất.

### 2.3 Bước `deck`

- **Context:** toàn bộ kết quả trước đó, nhưng WBS chỉ gửi bản tóm tắt (tổng theo phase × type) để tiết kiệm token.
- **LLM viết:** nội dung chữ cho 12 phần (mục 5) và tiêu chí nghiệm thu cho từng milestone.
- **Code chèn:** mọi bảng số (WBS tóm tắt, milestone, Gantt) được dựng từ dữ liệu `wbs` và `schedule`, LLM không viết lại số.
- **`post_validate`:** đủ 12 section theo đúng thứ tự; mỗi milestone có ≥ 2 tiêu chí; với pattern có AI, mỗi milestone có ít nhất 1 tiêu chí đo được (chứa chữ số hoặc %); mỗi slide ≤ 6 bullet, mỗi bullet ≤ 120 ký tự.
- **Tương thích ngược:** `GET /api/runs/{id}/proposal.md` vẫn giữ, nội dung render từ `deck` sang Markdown bằng code.

## 3. Schema mới

### 3.1 Pydantic

```python
# app/schemas/common.py — bổ sung
class WorkType(str, Enum):
    AI="AI"; BE="BE"; FE="FE"; QA="QA"; BA="BA"; PM="PM"
    INFRA="INFRA"; DESIGN="DESIGN"; DATA="DATA"
class Priority(str, Enum):  LOW="low"; MID="mid"; HIGH="high"
class TaskTag(str, Enum):
    DATA_PREP="data_prep"; EVALUATION="evaluation"; PROMPT_TUNING="prompt_tuning"
    INTEGRATION="integration"; SECURITY="security"; DOCUMENTATION="documentation"

# app/schemas/gaps.py — ClarifyingQuestion thêm 1 trường
    priority: Priority = Priority.MID     # blocking=True thì luôn là high (post_validate ép)

# app/schemas/wbs.py — Bước 6
class WbsItem(BaseModel):
    id: str                               # "1", "1.2", "1.2.3"
    phase: Phase                          # poc | mvp | production
    name: str                             # tên task / sub-task, tiếng Việt
    level: int = Field(ge=1, le=3)        # 1 = nhóm, 2 = task, 3 = sub-task
    type: WorkType | None = None          # bắt buộc với node lá
    priority: Priority = Priority.MID
    estimate_md: float | None = Field(default=None, ge=0, le=10)  # chỉ node lá
    depends_on: list[str] = []
    deliverable: str | None = None
    tags: list[TaskTag] = []
    note: str | None = None

class PhaseTotal(BaseModel):
    phase: Phase
    total_md: float                       # code tính
    by_type: dict[WorkType, float]        # code tính
    adjustment_note: str | None = None    # bắt buộc nếu lệch computed_estimates

class WbsResult(BaseModel):
    items: list[WbsItem]
    totals: list[PhaseTotal] = []         # LLM có thể để trống; code ghi đè
    assumptions: list[str]
    out_of_scope: list[str]

# app/schemas/schedule.py — Bước 7
class ScheduleConfig(BaseModel):
    start_date: date                      # mặc định: thứ Hai gần nhất sau 14 ngày kể từ hôm nay
    headcount: dict[WorkType, int]        # mặc định mục 4.2
    buffer_ratio: float = 0.15
    holidays: list[date] = []

class PhaseSchedule(BaseModel):
    phase: Phase
    start: date; end: date
    working_days: int

class TaskSchedule(BaseModel):
    wbs_id: str                           # chỉ node level 2
    start: date; end: date

class Milestone(BaseModel):
    id: str                               # "M1", "M2", …
    name: str
    date: date
    phase: Phase
    payment_percent: int | None = None    # % thanh toán gắn milestone (mục 4.3)

class ScheduleResult(BaseModel):
    config: ScheduleConfig
    phases: list[PhaseSchedule]
    tasks: list[TaskSchedule]
    milestones: list[Milestone]
    mermaid_gantt: str

# app/schemas/deck.py — Bước 8 (thay ProposalResult)
class DeckSection(str, Enum):
    OVERVIEW="overview"; SOLUTION="solution"; SCOPE="scope"; SCHEDULE="schedule"
    TEAM="team"; QUALITY="quality"; ACCEPTANCE="acceptance"; SECURITY="security"
    LICENSE="license"; RISK="risk"; COMMERCIAL="commercial"; CAPABILITY="capability"

class Slide(BaseModel):
    section: DeckSection
    title: str
    bullets: list[str] = Field(max_length=6)
    speaker_notes: str | None = None
    data_table: Literal["wbs_summary", "milestones", "risks", "team", None] = None
                                          # code chèn bảng từ dữ liệu tương ứng

class AcceptanceCriteria(BaseModel):
    milestone_id: str
    criteria: list[str] = Field(min_length=2)

class DeckResult(BaseModel):
    title: str
    language: Literal["vi", "en", "ja"]
    slides: list[Slide]                   # 12–18 slide, phủ đủ 12 section theo thứ tự enum
    acceptance: list[AcceptanceCriteria]
```

`ScopingRun` (AGENTS.md 4.1): bỏ `proposal`, thêm `wbs: WbsResult | None`, `schedule: ScheduleResult | None`, `deck: DeckResult | None`, `schedule_config: ScheduleConfig | None`.

### 3.2 Knowledge base `wbs_templates.yaml`

```yaml
mandatory:                       # mọi pattern đều phải có
  - { name: "Kick-off và quản lý dự án", type: PM, share: 0.10 }   # share = tỉ lệ gợi ý trên tổng
  - { name: "Phân tích yêu cầu",          type: BA, share: 0.08 }
  - { name: "Test và nghiệm thu",         type: QA, share: 0.15 }
  - { name: "Tài liệu và bàn giao",       type: BA, tags: [documentation] }
by_pattern:
  rag:
    - { name: "Thu thập và làm sạch tài liệu", type: DATA, tags: [data_prep] }
    - { name: "Pipeline ingest và chunking",    type: AI }
    - { name: "Retrieval và prompt",            type: AI, tags: [prompt_tuning] }
    - { name: "Bộ đánh giá độ chính xác",       type: AI, tags: [evaluation] }
    - { name: "API hỏi đáp",                    type: BE }
    - { name: "Giao diện chat",                 type: FE }
  agent: [ … ]                   # [Người] điền cho agent, classic_ml, fine_tune, no_ai_rule_based
```

## 4. Thuật toán master schedule

Master schedule tính hoàn toàn bằng code trong `app/agents/schedule.py`, hàm thuần `build_schedule(wbs: WbsResult, config: ScheduleConfig) -> ScheduleResult`, để cùng một WBS luôn ra cùng một lịch.

### 4.1 Các bước tính

1. **Lịch làm việc:** thứ Hai – thứ Sáu, bỏ `config.holidays`. Viết helper `add_working_days(d, n)` và `working_days_between(a, b)`.
2. **Thứ tự giai đoạn:** `poc` → `mvp` → `production`, nối tiếp nhau; giai đoạn sau bắt đầu ngày làm việc kế tiếp sau giai đoạn trước. Giai đoạn không có task thì bỏ qua.
3. **Thời lượng mỗi task level 2:** `duration = ceil(max over type (md_type / headcount[type]))`, tối thiểu 1 ngày; `md_type` là tổng `estimate_md` của các node lá bên dưới theo từng type.
4. **Xếp task trong giai đoạn:** duyệt theo thứ tự topo của `depends_on` (phụ thuộc giữa sub-task được nâng lên task cha level 2). Task không phụ thuộc bắt đầu ngay đầu giai đoạn; task có phụ thuộc bắt đầu sau ngày kết thúc muộn nhất của các task nó phụ thuộc. Phụ thuộc sang giai đoạn trước coi như đã thỏa.
5. **Ràng buộc nguồn lực (đơn giản hóa):** `resource_days = ceil(max over type (tổng md_type cả giai đoạn / headcount[type]))`. Độ dài giai đoạn = `max(critical_path_days, resource_days)`.
6. **Buffer:** cộng `ceil(độ dài × buffer_ratio)` ngày vào cuối giai đoạn.
7. **Milestone** (mục 4.3) và **Mermaid gantt** (mỗi giai đoạn một `section`, mỗi task level 2 một dòng, milestone dùng cú pháp `milestone`).

Giới hạn cần ghi trong README và trên slide: đây là lịch ước lượng sơ bộ, chưa cân bằng nguồn lực từng ngày giữa các task chạy song song.

### 4.2 Cấu hình mặc định

| Type | Headcount mặc định |
| --- | --- |
| PM, BA, BE, FE, QA, DATA, INFRA, DESIGN | 1 |
| AI | 2 |

Người dùng đổi được ngày bắt đầu và headcount trên giao diện (mục 7). WBS có task thuộc type có headcount 0 → `ScheduleError` với thông báo tiếng Việt nêu tên type.

### 4.3 Milestone mặc định

| ID | Tên | Ngày | Thanh toán mặc định |
| --- | --- | --- | --- |
| M1 | Kick-off | Ngày bắt đầu dự án | 30% |
| M2 | Nghiệm thu PoC | Ngày cuối giai đoạn `poc` | — |
| M3 | Nghiệm thu MVP | Ngày cuối giai đoạn `mvp` | 40% |
| M4 | Go-live | Ngày cuối giai đoạn `production` | 30% |

Thiếu giai đoạn nào thì bỏ milestone đó và dồn % thanh toán vào milestone kế tiếp. Tỉ lệ thanh toán chỉ là mặc định để điền slide, presales sẽ chỉnh theo hợp đồng thật.

### 4.4 Test bắt buộc (`tests/test_schedule.py`)

- WBS 2 task song song 5 md type BE, headcount BE = 1 → giai đoạn dài 10 ngày trước buffer (ràng buộc nguồn lực thắng).
- Task B phụ thuộc task A → B bắt đầu sau A.
- Ngày bắt đầu là thứ Sáu, task 2 ngày → kết thúc thứ Hai tuần sau.
- Holiday nằm giữa task → ngày kết thúc lùi một ngày.
- Không có `production` → không có M4, M3 nhận 70%.
- Cùng input chạy hai lần cho cùng output.

## 5. Cấu trúc slide proposal

Deck có đúng 12 section theo thứ tự dưới đây, mỗi section 1–2 slide, tổng 12–18 slide không tính slide bìa. Ngôn ngữ slide = `intake.language`.

| # | `section` | Nội dung bắt buộc | Bảng do code chèn | Nguồn dữ liệu |
| --- | --- | --- | --- | --- |
| 1 | `overview` | Bối cảnh khách, vấn đề hiện tại (as-is), mục tiêu (to-be) | — | `intake` |
| 2 | `solution` | Hướng giải pháp, lý do chọn, kiến trúc, tech stack | — | `pattern`, `architecture` |
| 3 | `scope` | Trong phạm vi, **ngoài phạm vi**, giả định | `wbs_summary` | `wbs.out_of_scope`, `wbs.assumptions`, `pattern.assumptions` |
| 4 | `schedule` | Giai đoạn, milestone, master schedule tổng thể | `milestones` + hình Gantt | `schedule` |
| 5 | `team` | Cơ cấu team, vai trò, quy trình làm việc, tần suất báo cáo | `team` | `schedule.config.headcount` |
| 6 | `quality` | Chiến lược test, môi trường test, quy trình review | — | task type QA trong `wbs` |
| 7 | `acceptance` | Tiêu chí nghiệm thu theo từng milestone; với AI: chỉ số đo được trên bộ test hai bên thống nhất | Bảng milestone × tiêu chí | `deck.acceptance` |
| 8 | `security` | Xử lý dữ liệu khách, NDA, kiểm soát truy cập, dữ liệu có gửi ra API ngoài hay dùng để train không | — | `intake.constraints`, `feasibility.risks` (privacy, compliance) |
| 9 | `license` | License thư viện OSS, license model AI (dùng thương mại), chi phí API/token, quyền sở hữu source code | — | `architecture.components` |
| 10 | `risk` | Rủi ro chính và cách giảm thiểu | `risks` (top 5 theo severity) | `feasibility.risks` |
| 11 | `commercial` | Phương thức giá (fixed/T&M), lịch thanh toán theo milestone, bảo hành, bảo trì | Bảng milestone × % thanh toán | `schedule.milestones` |
| 12 | `capability` | Lý do chọn đơn vị, dự án tương tự | — | `architecture.reference_projects` |

**Quy tắc nội dung cho prompt `07_deck.md`:**

- Không đưa ra **giá tiền** cụ thể. Slide `commercial` chỉ nói phương thức và tổng effort (man-day); phần giá ghi `[Presales điền]`.
- Không khẳng định chứng chỉ bảo mật, tên khách hàng cũ hay con số năng lực cụ thể của công ty; ghi `[Presales xác nhận]` thay vì bịa.
- License model AI phải ghi `[Cần kiểm tra điều khoản license của <tên model>]` thay vì tự kết luận.
- Tiêu chí nghiệm thu AI phải nêu cách đo (bộ test, số mẫu, ngưỡng), ví dụ "Độ chính xác câu trả lời ≥ 85% trên bộ 200 câu hỏi do khách cung cấp". Ngưỡng là đề xuất, đánh dấu `(đề xuất, chốt khi kick-off)`.
- Placeholder trong ngoặc vuông được tô vàng trên slide để presales dễ thấy.

## 6. Export, API và SSE bổ sung

### 6.1 File Excel `bidding_<run_id>.xlsx` (`app/export/excel.py`, openpyxl)

Bốn sheet theo thứ tự; mọi sheet có header in đậm nền xám, freeze hàng đầu, bật auto-filter, độ rộng cột vừa nội dung (tối đa 60), text wrap.

| Sheet | Cột (theo thứ tự) | Ghi chú định dạng |
| --- | --- | --- |
| `Q&A` | No, Category, Question, Why we ask, Priority, Blocking, Customer answer, Status | `Customer answer` để trống, `Status` = "Open"; Priority high tô đỏ nhạt; Category = `topic` |
| `WBS` | ID, Phase, Task, Sub-task, Type, Priority, Estimate (MD), Depends on, Deliverable, Note | Level 1 in đậm; level 2 nằm cột Task, level 3 nằm cột Sub-task; cột Estimate của node cha là **công thức Excel `=SUM(...)`** của node con, để presales sửa số thì tổng tự cập nhật; dòng cuối mỗi phase là tổng |
| `Summary` | Phase × Type (ma trận man-day) + cột Total + dòng Total | Ô là công thức `SUMIFS` trỏ về sheet WBS; bên dưới liệt kê Assumptions và Out of scope |
| `Master Schedule` | ID, Task, Phase, Start, End, Days, rồi mỗi tuần một cột (nhãn `dd/mm` thứ Hai) | Ô tuần nằm trong khoảng task được tô màu theo phase; milestone là dòng riêng, ô tuần chứa ký tự `◆` |

Tên sheet và header giữ tiếng Anh (đồng nhất khi gửi khách Nhật/quốc tế); nội dung ô theo ngôn ngữ của dữ liệu.

### 6.2 File PowerPoint `proposal_<run_id>.pptx` (`app/export/pptx.py`, python-pptx)

- 16:9, font mặc định của template; nếu có `knowledge_base/templates/proposal_template.pptx` thì dùng layout của file đó (**\[Người\]** đặt template công ty vào), không có thì dùng template trắng của python-pptx.
- Slide bìa: `deck.title`, dòng phụ "Bản nháp – sinh bởi ScopeAI, cần review", ngày.
- Mỗi `Slide`: tiêu đề, bullet, speaker notes; nếu có `data_table` thì vẽ bảng python-pptx từ dữ liệu tương ứng bên phải hoặc bên dưới bullet.
- Slide `schedule`: Gantt vẽ bằng shape (hình chữ nhật theo tuần, hình thoi cho milestone), không chèn ảnh.
- Text trong `[...]` được tô nền vàng.

### 6.3 API (bổ sung vào AGENTS.md mục 4.2)

| Method + path | Request | Response | Lỗi |
| --- | --- | --- | --- |
| `POST /runs` | thêm trường tuỳ chọn `schedule_config` | như cũ | `422` |
| `PUT /runs/{id}/schedule-config` | `ScheduleConfig` | `200 ScopingRun` sau khi **tính lại** `schedule` (không gọi LLM; `deck.acceptance` giữ nguyên theo `milestone_id`) | `409` nếu chưa có `wbs` |
| `GET /runs/{id}/bidding.xlsx` | — | file Excel | `409` nếu chưa có `gaps (chưa có wbs thì chỉ xuất sheet Q&A)` |
| `GET /runs/{id}/proposal.pptx` | — | file PowerPoint | `409` nếu chưa có `deck` |
| `GET /runs/{id}/proposal.md` | — | Markdown render từ `deck` | `409` nếu chưa có `deck` |

Sheet `Q&A` xuất được ngay khi có `gaps`: nếu chưa có `wbs`, `bidding.xlsx` trả file chỉ gồm sheet `Q&A` thay vì `409`, để presales gửi câu hỏi cho khách ngay khi run đang `waiting_clarification`.

### 6.4 SSE

`StepName` mới: `"intake" | "gaps" | "pattern" | "feasibility" | "architecture" | "wbs" | "schedule" | "deck"`. Không thêm loại sự kiện mới; chuỗi sự kiện khi chạy đủ là `status, (step_started, step_done) × 8, status`.

## 7. Giao diện và evaluation bổ sung

### 7.1 Giao diện

- **`StepTimeline`:** 8 bước; bước `schedule` có nhãn phụ "tính bằng code".
- **`QuestionList`:** thêm badge priority và nút **Tải Q&A (Excel)**, hiện ngay cả khi đang `waiting_clarification`.
- **`WbsCard` (mới):** bảng cây thu gọn được theo level; tab theo phase; bộ lọc theo Type và Priority; chip màu theo Type; hàng tổng mỗi phase; ma trận Phase × Type phía trên; cảnh báo vàng nếu phase có `adjustment_note`.
- **`ScheduleCard` (mới):** form nhỏ đổi ngày bắt đầu và headcount từng type, nút **Tính lại lịch** (`PUT /schedule-config`); Gantt theo tuần vẽ bằng `div` + CSS grid (không thêm thư viện chart); milestone là hình thoi có nhãn và % thanh toán.
- **`DeckCard` (thay `ProposalCard`):** xem trước dạng lưới thumbnail 12 section (tiêu đề + bullet), bấm để phóng to; placeholder `[...]` tô vàng; bảng tiêu chí nghiệm thu theo milestone.
- **Thanh dưới (`ReviewBar`):** thêm 2 nút **Tải bộ bidding (Excel)** và **Tải slide (PowerPoint)**.

### 7.2 Evaluation bổ sung

Thêm vào `expected` của mỗi case (tuỳ chọn): `wbs_total_md: {poc: [min, max], mvp: [min, max]}`.

| Metric mới | Cách tính | Mục tiêu đề xuất |
| --- | --- | --- |
| WBS valid rate | Số case `wbs` qua `post_validate` không cần retry / số case chạy tới `wbs` | ≥ 90% |
| WBS total in range | Tổng MVP của WBS giao với khoảng chuyên gia | ≥ 70% |
| Type coverage | Tỉ lệ case có đủ PM, QA, BA và (nếu pattern AI) task `data_prep` + `evaluation` | 100% (code ép, metric kiểm tra) |
| Measurable acceptance | Tỉ lệ milestone có tiêu chí chứa số hoặc % (pattern AI) | 100% |
| Hallucination flags | Số slide nhắc tên khách hàng, chứng chỉ hoặc giá tiền không nằm trong placeholder | 0 |

`Hallucination flags` kiểm tra bằng regex: ký hiệu tiền tệ (`¥`, `$`, `VND`, `円`), chuỗi `ISO`, `ISMS` nằm ngoài `[...]`.

## 8. Task list B01–B10

Làm theo thứ tự, sau khi T10 của AGENTS.md đã xong; mỗi task chỉ bắt đầu khi task trước qua Verify.

- [ ] B01 – Schema và contract mới
- [ ] B02 – KB `wbs_templates.yaml` **\[Người\]**
- [ ] B03 – Bước `wbs`
- [ ] B04 – Bước `schedule`
- [ ] B05 – Bước `deck`
- [ ] B06 – Export Excel
- [ ] B07 – Export PowerPoint
- [ ] B08 – API và pipeline 8 bước
- [ ] B09 – Giao diện bidding
- [ ] B10 – Evaluation bidding **\[Người\]**

### B01 – Schema và contract mới

- **Làm:** enum mới trong `common.py`; `priority` cho `ClarifyingQuestion`; file `wbs.py`, `schedule.py`, `deck.py` theo mục 3.1; cập nhật `ScopingRun`; xóa `ProposalResult`; fixture `valid_wbs.json`, `valid_deck.json`; cập nhật `frontend/src/types.ts`; cập nhật bảng contract trong AGENTS.md mục 4.
- **Xong khi:** fixture validate được; `estimate_md = 11` bị từ chối; `bullets` 7 phần tử bị từ chối; `acceptance.criteria` 1 phần tử bị từ chối; test cũ vẫn xanh (sửa test liên quan `proposal`).
- **Verify:** `pytest -q && cd ../frontend && npm run build`

### B02 – KB `wbs_templates.yaml` \[Người\]

- **AI làm:** khung file theo mục 3.2 với đủ 5 pattern (nội dung `TODO`); cập nhật loader; test đọc được file.
- **Người làm:** điền task chuẩn cho từng pattern và tỉ lệ `share` theo kinh nghiệm thực tế.
- **Verify:** `pytest tests/test_loader.py -q`

### B03 – Bước `wbs`

- **Làm:** prompt `prompts/06_wbs.md` (dùng `wbs_templates` làm khung, tách task ≤ 10 md, mỗi node lá có type/priority/deliverable, ghi giả định và ngoài phạm vi); `post_validate` đúng mục 2.1, trong đó code **tính lại** estimate node cha và `totals`; khai báo Step trong `steps.py`. Đổi tên prompt proposal cũ thành `07_deck.md` ở B05.
- **Xong khi:** test pass cho: id trùng bị từ chối; `depends_on` trỏ id không tồn tại bị từ chối; vòng phụ thuộc bị từ chối; thiếu QA bị từ chối; pattern rag thiếu `evaluation` bị từ chối; tổng lệch > 20% không có `adjustment_note` bị từ chối; tổng node cha do LLM điền sai được code sửa đúng.
- **Verify:** `pytest tests/test_wbs.py -q`

### B04 – Bước `schedule`

- **Làm:** `agents/schedule.py` với `build_schedule()` và `ScheduleError` theo mục 4; sinh `mermaid_gantt`; tích hợp như một bước không dùng LLM trong pipeline.
- **Xong khi:** đủ 6 test mục 4.4; Mermaid sinh ra có cú pháp `gantt`, `dateFormat YYYY-MM-DD`, mỗi phase một `section`.
- **Verify:** `pytest tests/test_schedule.py -q`

### B05 – Bước `deck`

- **Làm:** prompt `prompts/07_deck.md` theo quy tắc mục 5; context chỉ gửi tóm tắt WBS (mục 2.3); `post_validate` theo mục 2.3; hàm `deck_to_markdown(run) -> str` cho endpoint `proposal.md`.
- **Xong khi:** test pass cho: thiếu section bị từ chối; sai thứ tự section bị từ chối; milestone thiếu tiêu chí bị từ chối; pattern rag với tiêu chí không có số bị từ chối; `deck_to_markdown` có đủ 12 heading.
- **Verify:** `pytest tests/test_deck.py -q`

### B06 – Export Excel

- **Làm:** `app/export/excel.py` với `build_bidding_xlsx(run) -> bytes` theo mục 6.1, kể cả trường hợp chỉ có `gaps`.
- **Xong khi:** test mở lại file bằng openpyxl và kiểm tra: đủ 4 sheet đúng tên và thứ tự; header đúng cột; ô estimate của node cha là chuỗi công thức bắt đầu bằng `=SUM`; số cột tuần của Master Schedule = số tuần từ ngày bắt đầu đến ngày kết thúc; run chỉ có gaps → 1 sheet `Q&A`.
- **Verify:** `pytest tests/test_export_excel.py -q`; mở file mẫu bằng Excel kiểm tra tay

### B07 – Export PowerPoint

- **Làm:** `app/export/pptx.py` với `build_proposal_pptx(run) -> bytes` theo mục 6.2; hỗ trợ template tuỳ chọn.
- **Xong khi:** test mở lại file bằng python-pptx: số slide = 1 + `len(deck.slides)`; slide có `data_table` chứa một shape bảng; slide `schedule` có ít nhất số shape bằng số task level 2; placeholder `[...]` có highlight.
- **Verify:** `pytest tests/test_export_pptx.py -q`; mở file mẫu bằng PowerPoint kiểm tra tay

### B08 – API và pipeline 8 bước

- **Làm:** cập nhật `pipeline.py` theo thứ tự 8 bước; endpoint mục 6.3 (file trả về với `Content-Disposition: attachment` và đúng MIME type); cập nhật `MockLLM` fixture cho `wbs` và `deck`.
- **Xong khi:** test API pass cho mọi mã lỗi mục 6.3; stream mock ra đúng chuỗi sự kiện mục 6.4; `PUT /schedule-config` đổi headcount AI từ 2 lên 4 làm ngày kết thúc MVP sớm hơn hoặc bằng.
- **Verify:** `pytest -q`

### B09 – Giao diện bidding

- **Làm:** các thay đổi mục 7.1; `api.ts` thêm `putScheduleConfig`, `biddingXlsxUrl`, `proposalPptxUrl`.
- **Xong khi:** với mock, chạy một run đủ 8 bước, lọc WBS theo Type, đổi headcount và thấy Gantt cập nhật, tải được cả hai file; case mơ hồ tải được Q&A khi đang chờ.
- **Verify:** `npm run build` + thử tay

### B10 – Evaluation bidding \[Người\]

- **AI làm:** thêm 5 metric mục 7.2 vào `metrics.py`, `run_eval.py` và report; thêm `wbs_total_md` vào 3 case mẫu.
- **Người làm:** điền `wbs_total_md` cho các case còn lại; chạy eval với LLM thật, đọc tay ít nhất 3 file Excel và 3 file slide sinh ra.
- **Verify:** `pytest tests/test_metrics.py -q && LLM_PROVIDER=mock python -m eval.run_eval`

## 9. Trạng thái triển khai (05/10/2026)

Phạm vi đã chọn: phần "ăn tiền" của mục 0 (B01–B04, B06) trên nền code hiện có (đã tới T44), **không** đổi pipeline sang `deck`. Slide 12 phần (B05, B07) để vòng sau.

- [x] B01 – Schema: `WorkType`, `Priority`, `TaskTag`; `ClarifyingQuestion.priority`; `WbsItem`/`WbsResult` (`app/schemas/wbs.py`), `ScheduleConfig`/`ScheduleResult` (`app/schemas/schedule.py`); `ScopingRun.schedule_config`. **Chưa** có `deck.py` (thuộc B05).
- [x] B02 – `knowledge_base/wbs_templates.yaml` đủ 5 pattern: **bản nháp do AI soạn, chủ dự án cần review** nội dung và `share`.
- [x] B03 – Bước `wbs` (`prompts/08_wbs.md`, `make_wbs_validator` trong `agents/steps.py`), đủ các kiểm tra mục 2.1.
- [x] B04 – `agents/schedule.py`: `build_schedule()`, `ScheduleError`, milestone M1–M4, Mermaid gantt; đủ 6 test mục 4.4 (`tests/test_schedule.py`).
- [ ] B05 – Bước `deck`.
- [x] B06 – `app/exports/bidding.py`: `build_bidding_xlsx()` 4 sheet (`tests/test_bidding_excel.py`).
- [ ] B07 – Export PowerPoint 12 phần.
- [~] B08 – Đã có `GET /runs/{id}/bidding.xlsx`, `PUT /runs/{id}/schedule-config`, `schedule_config` trong `POST /runs`; chưa có `proposal.pptx` (B07).
- [x] Sửa tay man-day task lá ngay trên bảng WBS (`PATCH /runs/{id}/wbs`): node cha cộng lại khi đang gõ, lưu thì code tính lại tổng, lịch, báo giá; khóa khi giá hoặc hồ sơ đã duyệt.
- [~] B09 – Đã có: `WBSCard` (ma trận Phase × Type, cây thu gọn, lọc Type/Priority, cảnh báo `adjustment_note`), form ngày bắt đầu/headcount + **Tính lại lịch**, Gantt theo tuần có milestone, badge priority câu hỏi, nút tải bộ bidding. Chưa có `DeckCard`.
- [ ] B10 – Metric eval bidding.

### Khác với spec (có chủ đích)

| Spec | Đã làm | Lý do |
| --- | --- | --- |
| Pipeline 8 bước mới, bỏ `proposal` và (ngầm định) bỏ `requirements` | Giữ 8 bước hiện có (`… architecture, wbs, requirements, proposal`); lịch tính bằng code ngay sau `wbs`, gửi kèm `step_done` của `wbs` | `proposal` đang được Word, bản dịch, sửa tay, phiên bản, eval, replay dùng; `requirements` là tính năng đang chạy |
| `estimate_md: Field(le=10)` | Giới hạn 10 MD chỉ áp cho **node lá** (kiểm tra trong `WbsResult`) | Node cha chứa tổng do code cộng, sẽ > 10 và bị chính ràng buộc này từ chối khi đọc lại |
| `app/export/excel.py` | `app/exports/bidding.py` (+ `app/exports/plan.py` dùng chung) | Theo cấu trúc thư mục hiện có |
| File `bidding_<run_id>.xlsx` | Tên theo quy tắc đặt tên của công ty (`…_Bidding_v0.1_<ngày>.xlsx`); có cả `/export/bidding.xlsx` và trong gói `.zip` | Đồng nhất với các file xuất khác (T43) |
| Sheet Q&A: `Customer answer` trống, `Status` = Open | Nếu khách đã trả lời trong hệ thống thì điền sẵn và `Status` = Answered | Presales không phải chép lại câu trả lời |
| Không ghi giá trên tài liệu | Giữ báo giá do code tính và có bước duyệt giá (quyết định của chủ dự án 05/10) | LLM vẫn không bao giờ viết số tiền |
| — | Báo giá tính theo node lá × Type; **không cộng PM overhead 10% cho giai đoạn đã có task PM** trong WBS (BrSE cho khách Nhật vẫn cộng) | WBS bắt buộc có PM (mục 3.2), tránh tính PM hai lần |
| — | Run cũ (WBS phẳng `tasks`, lịch theo số ngày) tự chuyển sang dạng mới khi đọc; lịch được tính lại khi xuất | Hồ sơ và replay đã lưu vẫn mở được |

Lịch tổng thể là **ước lượng sơ bộ**: chưa cân bằng nguồn lực từng ngày giữa các task chạy song song (mục 4.1).
