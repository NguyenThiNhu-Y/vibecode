# AGENTS.md – Spec cho AI coding agent (ScopeAI)

## 0. Cách dùng tab này (dành cho bạn, không phải cho AI)

Export tab này ra Markdown, đặt thành file `AGENTS.md` (hoặc `CLAUDE.md`, `.cursorrules` tùy công cụ) ở gốc repo, rồi giao cho AI từng task một theo mục 6. Mọi thứ AI cần biết đều nằm trong tab này, nên AI không cần đọc tab kế hoạch.

1. **Tạo repo trống**, copy `AGENTS.md` vào gốc.
2. **Mỗi lần chỉ giao MỘT task** (ví dụ "Làm T03"), dùng prompt ở mục 7. Task nhỏ giúp AI ít bịa và bạn dễ review.
3. **Kiểm tra tiêu chí hoàn thành** của task đó (chạy lệnh verify), rồi mới commit và tick task trong mục 6.
4. **Khi AI làm sai hướng**, đừng sửa bằng chat dài: sửa spec trong tab này (nếu spec thiếu) rồi export lại, để lần sau AI đọc đúng.
5. **Phần bạn tự làm, không giao AI:** nội dung knowledge base (T04), đáp án kỳ vọng của 15 test case (T11), và tinh chỉnh prompt dựa trên kết quả eval. Đây là phần thể hiện chuyên môn của bạn; AI chỉ nên tạo khung.
6. **Trước khi bắt đầu**, điền các giá trị `<TODO>` trong mục 3 (cách gọi VibeFlow) sau khi hỏi BTC.

Spec viết bằng tiếng Việt với thuật ngữ kỹ thuật giữ nguyên tiếng Anh; các AI coding agent phổ biến đọc tốt cả hai.

## 1. Bối cảnh và mục tiêu sản phẩm

Bạn (AI agent) đang xây **ScopeAI**: một web app nhận yêu cầu AI thô của khách hàng (email/RFP, kèm file Excel requirement, PDF/DOCX, data mẫu, source code) và chạy một pipeline LLM 8 bước để trả về bộ hồ sơ proposal sơ bộ (slide, Word, Excel). Người dùng là presales (nhập yêu cầu) và AI developer (review, duyệt).

Dự án là bài thi nội bộ, hạn nộp **16/10/2026**. Ưu tiên theo thứ tự: (1) pipeline chạy đúng và ổn định, (2) script evaluation đo được chất lượng, (3) giao diện hiển thị từng bước theo thời gian thực để demo.

**Pipeline 8 bước** (trước đó là bước 0 đọc file đính kèm bằng code):

1. `intake` — trích xuất thông tin có cấu trúc từ yêu cầu
2. `gaps` — tìm thông tin thiếu, sinh câu hỏi làm rõ; có thể **dừng pipeline** chờ người dùng trả lời
3. `pattern` — chọn hướng giải pháp, kể cả "không cần AI"
4. `feasibility` — chấm điểm khả thi, liệt kê rủi ro
5. `architecture` — component, deployment, effort (effort gốc **tính bằng code**, LLM chỉ giải thích)
6. `wbs` — chia công việc theo giai đoạn; code kiểm tra tổng ngày công khớp effort và tính timeline
7. `requirements` — bảng đáp ứng từng requirement của khách (bỏ qua nếu không có file requirement)
8. `proposal` — viết proposal Markdown từ kết quả các bước trước

**Ngoài phạm vi (không làm trừ khi được yêu cầu):** đăng nhập/phân quyền, vector DB, deploy cloud, đa người dùng đồng thời, tích hợp email/CRM, Docker.

## 2. Quy tắc bắt buộc

Các quy tắc này áp dụng cho mọi task; nếu một yêu cầu trong task mâu thuẫn với quy tắc, hãy dừng lại và hỏi.

**Phạm vi làm việc**

- Chỉ làm đúng task được giao. Không tự làm trước task sau, không refactor code không liên quan.
- Trước khi code, liệt kê ngắn các file sẽ tạo/sửa. Sau khi code, chạy lệnh verify của task và báo kết quả thật (không được báo "đã pass" nếu chưa chạy).
- Spec thiếu hoặc mơ hồ → hỏi lại, hoặc chọn cách đơn giản nhất và ghi rõ giả định trong câu trả lời.

**Contract**

- Tên trường, enum, endpoint, tên sự kiện SSE phải khớp **chính xác** mục 4. Không đổi tên, không thêm trường bắt buộc mới.
- Muốn đổi contract → đề xuất trong câu trả lời, không tự đổi.

**LLM**

- Mọi lời gọi LLM đi qua interface `LLMClient`. Không gọi SDK/HTTP của nhà cung cấp trực tiếp ở nơi khác.
- Prompt nằm trong `backend/app/prompts/*.md`, không hardcode prompt dài trong file Python.
- Không bao giờ để LLM tự sinh con số effort gốc; dùng `compute_estimates()`.
- Unit test **không được** gọi LLM thật; dùng `MockLLM` hoặc fake client.

**Bảo mật và dữ liệu**

- Không commit API key; đọc từ `.env`, có `.env.example` với giá trị giả.
- Mọi dữ liệu mẫu, test case, dự án tham chiếu là **giả lập**. Không tạo tên công ty thật.

**Code style**

- Python 3.11, type hint đầy đủ, async cho I/O, `ruff` format. Không dùng ORM.
- TypeScript strict, function component + hooks, Tailwind utility class, không thêm thư viện UI lớn (MUI, Ant…).
- Text hiển thị cho người dùng: tiếng Việt. Tên biến, hàm, comment code: tiếng Anh.
- Không thêm dependency ngoài danh sách ở mục 3 mà không nêu lý do.

## 3. Tech stack, cấu trúc repo, lệnh chạy

### 3.1 Dependency được phép

- **Backend:** `fastapi`, `uvicorn[standard]`, `sse-starlette`, `pydantic>=2`, `pydantic-settings`, `httpx`, `pyyaml`, `pypdf` (đọc RFP dạng PDF), `python-multipart` (upload file), `openpyxl` (đọc/xuất Excel), `python-docx` (đọc/xuất Word), `python-pptx` (xuất slide)
- **Backend dev:** `pytest`, `pytest-asyncio`, `ruff`
- **Frontend:** `react`, `react-dom`, `react-router-dom`, `react-markdown`, `remark-gfm` (bảng Markdown), `tailwindcss` + `@tailwindcss/vite`, `vite` + `@vitejs/plugin-react`, `typescript`, `@fontsource/be-vietnam-pro` (font đóng gói sẵn để demo offline), `mermaid` (sơ đồ kiến trúc, lazy-load)

### 3.2 Cấu trúc repo (đích đến)

```
scopeai/
├── AGENTS.md
├── README.md
├── backend/
│   ├── pyproject.toml            # hoặc requirements.txt + requirements-dev.txt
│   ├── .env.example
│   ├── app/
│   │   ├── main.py               # FastAPI app, routes
│   │   ├── config.py             # Settings (pydantic-settings)
│   │   ├── llm/  base.py  vibeflow.py  openai_compat.py  mock.py
│   │   ├── schemas/  common.py  intake.py  gaps.py  pattern.py
│   │   │             feasibility.py  architecture.py  proposal.py  run.py
│   │   ├── agents/  step.py  steps.py  estimate.py  pipeline.py
│   │   ├── prompts/  01_intake.md … 06_proposal.md
│   │   ├── knowledge/loader.py
│   │   └── storage/repo.py
│   ├── knowledge_base/
│   │   ├── solution_patterns.yaml  risk_checklist.yaml  estimation_template.yaml
│   │   └── reference_projects/*.md
│   ├── tests/                    # pytest, KHÔNG gọi LLM thật
│   └── eval/  cases/*.yaml  run_eval.py  reports/
└── frontend/
    └── src/  main.tsx  App.tsx  api.ts  types.ts  pages/  components/
```

### 3.3 Biến môi trường (`backend/.env.example`)

```bash
LLM_PROVIDER=mock            # mock | vibeflow | openai
LLM_BASE_URL=<TODO: endpoint VibeFlow hoặc OpenAI-compatible>
LLM_API_KEY=<TODO>
MODEL_NAME=<TODO>
LLM_TEMPERATURE=0.2
LLM_TIMEOUT_S=120
LLM_MAX_RETRIES=2            # thử lại lỗi mạng/HTTP tạm thời (429, 5xx, timeout), backoff 1s, 2s…
PII_MASKING=true             # che email/số điện thoại/link trước khi gửi LLM
DB_PATH=./scopeai.db
CORS_ORIGINS=http://localhost:5173
```

`<TODO>`: cách gọi VibeFlow từ code (endpoint, header auth, định dạng request/response) do chủ dự án bổ sung. Khi chưa có, `vibeflow.py` raise `NotImplementedError` với thông báo rõ ràng.

### 3.4 Lệnh

| Mục đích | Lệnh (chạy từ thư mục tương ứng) |
| --- | --- |
| Cài backend | `cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt -r requirements-dev.txt` |
| Chạy backend | `uvicorn app.main:app --reload --port 8000` |
| Unit test | `pytest -q` |
| Lint | `ruff check . && ruff format --check .` |
| Evaluation (LLM thật) | `python -m eval.run_eval` |
| Cài + chạy frontend | `cd frontend && npm install && npm run dev` (cổng 5173) |
| Kiểm tra type frontend | `npm run build` |

## 4. Contract (nguồn sự thật duy nhất)

Backend, frontend, test và eval đều dựa vào mục này. Viết đúng tên trường và giá trị enum như dưới đây.

### 4.1 Pydantic schema

```python
# app/schemas/common.py
class Confidence(str, Enum):  LOW="low"; MEDIUM="medium"; HIGH="high"
class SolutionPattern(str, Enum):
    NO_AI_RULE_BASED="no_ai_rule_based"; CLASSIC_ML="classic_ml"; RAG="rag"
    AGENT="agent"; FINE_TUNE="fine_tune"; NEEDS_CLARIFICATION="needs_clarification"
class QuestionTopic(str, Enum):
    DATA="data"; USERS="users"; ACCURACY="accuracy"; INFRA="infra"
    BUDGET="budget"; TIMELINE="timeline"; COMPLIANCE="compliance"; INTEGRATION="integration"
class RiskCategory(str, Enum):
    DATA="data"; ACCURACY="accuracy"; PRIVACY="privacy"; COMPLIANCE="compliance"
    COST="cost"; ADOPTION="adoption"
class GoRecommendation(str, Enum):  GO="go"; GO_WITH_POC="go_with_poc"; NOT_NOW="not_now"
class Deployment(str, Enum):  CLOUD="cloud"; ON_PREM="on_prem"; HYBRID="hybrid"
class Phase(str, Enum):  POC="poc"; MVP="mvp"; PRODUCTION="production"

# Bước 1
class IntakeResult(BaseModel):
    business_goal: str
    current_process: str | None = None
    users: list[str] = []
    data_sources: list[str] = []
    constraints: list[str] = []          # ví dụ "on_prem", "japanese_ui"
    budget: str | None = None
    timeline: str | None = None
    language: Literal["vi", "en", "ja"]
    industry: str | None = None

# Bước 2
class ClarifyingQuestion(BaseModel):
    id: str                              # "q1", "q2", … duy nhất trong run
    topic: QuestionTopic
    question: str                        # viết bằng intake.language
    why_it_matters: str                  # tiếng Việt
    blocking: bool
class GapResult(BaseModel):
    missing_info: list[str]
    questions: list[ClarifyingQuestion] = Field(max_length=7)
    can_proceed: bool                    # = not any(q.blocking for q in questions)

# Bước 3
class RejectedOption(BaseModel):  pattern: SolutionPattern; reason: str
class PatternResult(BaseModel):
    pattern: SolutionPattern
    rationale: str
    rejected: list[RejectedOption]
    confidence: Confidence
    assumptions: list[str] = []

# Bước 4
class RiskItem(BaseModel):
    category: RiskCategory; description: str
    severity: int = Field(ge=1, le=5); mitigation: str
class FeasibilityResult(BaseModel):
    data_readiness: int = Field(ge=1, le=5)
    technical_feasibility: int = Field(ge=1, le=5)
    business_value: int = Field(ge=1, le=5)
    risks: list[RiskItem]
    go_recommendation: GoRecommendation

# Bước 5
class Component(BaseModel):  name: str; purpose: str; tech_options: list[str]
class PhaseEstimate(BaseModel):
    phase: Phase
    min_person_days: int = Field(ge=0); max_person_days: int = Field(ge=0)
    team: list[str]; deliverables: list[str]
    adjustment_note: str | None = None   # lý do nếu lệch khỏi computed_estimates
class ArchitectureResult(BaseModel):
    components: list[Component]
    deployment: Deployment
    estimates: list[PhaseEstimate]
    reference_projects: list[str] = []
    mermaid: str | None = None

# Bước 6
class ProposalResult(BaseModel):  title: str; markdown: str; language: Literal["vi","en","ja"]

# app/schemas/run.py
class RunStatus(str, Enum):
    CREATED="created"; RUNNING="running"; WAITING_CLARIFICATION="waiting_clarification"
    DONE="done"; FAILED="failed"; APPROVED="approved"; REJECTED="rejected"
class ScopingRun(BaseModel):
    id: str                              # 8 ký tự hex
    created_at: datetime
    request_text: str
    status: RunStatus = RunStatus.CREATED
    answers: dict[str, str] = {}         # question.id -> câu trả lời
    intake: IntakeResult | None = None
    gaps: GapResult | None = None
    pattern: PatternResult | None = None
    feasibility: FeasibilityResult | None = None
    architecture: ArchitectureResult | None = None
    proposal: ProposalResult | None = None
    error: str | None = None
    reviewer_note: str | None = None
    step_latency_ms: dict[str, int] = {}
```

#### 4.1b Mở rộng (đã được chủ dự án duyệt, chỉ thêm trường tùy chọn)

```python
# app/schemas/effort.py
class Multiplier(BaseModel):  key: str; label: str; factor: float
class EffortBasis(BaseModel):            # cách tính computed_estimates (thuần code)
    pattern: SolutionPattern
    base: dict[Phase, list[int]]         # [min, max] từ estimation_template.yaml
    multipliers: list[Multiplier]        # các hệ số đã áp dụng
    factor: float                        # tích các hệ số
    computed: dict[Phase, list[int]]

# app/schemas/proposal.py
class TranslationResult(BaseModel):  markdown: str

# app/schemas/attachments.py  (file khách gửi, phân tích bằng code)
AttachmentKind = Literal["requirements", "document", "data_sample", "source_code"]
class RequirementItem(BaseModel):  id: str; text: str; priority: str | None; category: str | None; sheet: str | None
class ColumnProfile(BaseModel):  name: str; dtype: Literal["number","date","text","boolean","empty"]; null_ratio: float; unique: int; examples: list[str]; pii_suspect: bool
class DataProfile(BaseModel):  sheet: str | None; rows: int; columns: list[ColumnProfile]; issues: list[str]; readiness_hint: int  # 1–5, code tính
class CodeProfile(BaseModel):  files: int; total_lines: int; languages: dict[str, int]; frameworks: list[str]; top_dirs: list[str]; has_tests: bool; has_docker: bool; notes: list[str]
class Attachment(BaseModel):  id: str; filename: str; kind: AttachmentKind; size_bytes: int; text: str | None; pages: int | None; truncated: bool; requirements: list[RequirementItem]; data_profiles: list[DataProfile]; code_profile: CodeProfile | None

# app/schemas/wbs.py  (bước 6)
class WBSTask(BaseModel):  id: str; phase: Phase; name: str; role: str; person_days: int = Field(ge=1, le=200); depends_on: list[str] = []; deliverable: str | None = None
class WBSResult(BaseModel):  tasks: list[WBSTask] = Field(min_length=1, max_length=60); notes: list[str] = []
class ScheduledTask(BaseModel):  id: str; start_day: int; end_day: int
class Schedule(BaseModel):  tasks: list[ScheduledTask]; phases: dict[Phase, list[int]]; total_days: int  # code tính

# app/schemas/requirements.py  (bước 7)
Coverage = Literal["full", "partial", "not_supported", "needs_clarification"]
class RequirementAssessment(BaseModel):  req_id: str; coverage: Coverage; component: str | None = None; note: str
class RequirementMatrix(BaseModel):  items: list[RequirementAssessment]; skipped: bool = False

# app/schemas/quotation.py  (báo giá, code tính từ WBS × rate_card.yaml)
Currency = Literal["VND", "JPY", "USD"]
ContractModel = Literal["fixed_price", "time_material", "odc"]
class QuoteLine(BaseModel):  phase: Phase; role_key: str; role_label: str; person_days: int; day_rate: float; amount: float; kind: Literal["wbs", "overhead"] = "wbs"
class OdcMember(BaseModel):  role_label: str; fte: float; monthly_cost: float
class PhaseCost(BaseModel):  phase: Phase; person_days: int; amount: float; min_amount: float; max_amount: float
class Milestone(BaseModel):  name: str; percent: float; amount: float
class Quotation(BaseModel):  currency: Currency; contract_model: ContractModel = "fixed_price"; onsite_ratio: float = 0; wbs_person_days: int = 0; overhead_person_days: int = 0; odc_team: list[OdcMember] = []; odc_monthly_cost: float | None = None; months: int | None = None; lines: list[QuoteLine]; phases: list[PhaseCost]; subtotal: float; contingency_pct: float; contingency: float; total: float; total_min: float; total_max: float; monthly_run_cost: float | None; milestones: list[Milestone]; assumptions: list[str]

# app/schemas/deal.py
class DealStage(str, Enum):  NEW="new"; CLARIFYING="clarifying"; REVIEWING="reviewing"; READY="ready"; SENT="sent"; WON="won"; LOST="lost"; NO_BID="no_bid"
class BidDecision(BaseModel):  checks: dict[str, bool | None] = {}; decision: Literal["bid", "no_bid"] | None = None; note: str | None = None; decided_at: datetime | None = None
class PricingApproval(BaseModel):  approved: bool; note: str | None = None; at: datetime   # duyệt giá (cấp 2)
class ProposalVersion(BaseModel):  version: str; created_at: datetime; note: str | None; sent: bool = False; sent_at: datetime | None; markdown: str | None; proposal_title: str | None; total: float | None; currency: str | None; pattern: str | None
class ClientEmail(BaseModel):  subject: str; body: str   # LLM viết placeholder {{client_name}}, {{sender_name}}; code điền tên

# StepName = "intake" | "gaps" | "pattern" | "feasibility" | "architecture" | "wbs" | "requirements" | "proposal"

# Thêm vào ScopingRun (đều có giá trị mặc định)
    wbs: WBSResult | None = None
    requirements: RequirementMatrix | None = None
    attachments: list[Attachment] = []
    schedule: Schedule | None = None      # code tính từ wbs
    quotation: Quotation | None = None    # code tính sau bước wbs
    client_email: ClientEmail | None = None
    deck_translations: dict[str, dict[str, str]] = {}  # ngôn ngữ -> chuỗi gốc -> bản dịch (slide)
    project_name: str | None = None       # quản lý hồ sơ, KHÔNG gửi cho LLM
    client_name: str | None = None
    due_date: date | None = None          # hạn nộp proposal
    deal_stage: DealStage = DealStage.NEW
    bid: BidDecision | None = None
    pricing_approval: PricingApproval | None = None
    versions: list[ProposalVersion] = []

# app/schemas/settings.py (chuẩn công ty, sửa ở trang Cài đặt)
# CompanyProfile(name, short_name, confidential_footer, file_naming)  # file_naming bắt buộc có {doc}
# ContentBlock(id, enabled, position: start|end, title/body: {vi, en?, ja?})
# CaseStudy(id, title, industry, market: vn|jp|eu|other, pattern, year, public, challenge, solution, results, tech, duration)
# BidCriterion(id, label, weight, auto: solution_clear|data_ready|business_value|risk_acceptable|requirements_fit|budget_known|None)
# TemplatesConfig(active: {slides|proposal_docx|workbook|qa_sheet: builtin|sample|custom}, pptx, workbook: {wbs, pricing: SheetMapping}, qa_sheet: SheetMapping)
# RateCard thêm: roles[].onsite_day_rate, overheads[] (key, label, percent, role, when: always|japanese), contract (default_model, default_onsite_ratio, working_days_per_month)

# RunSummary thêm: project_name, client_name, due_date, deal_stage, quote_total, quote_currency, total_ms
    effort_basis: EffortBasis | None = None
    feedback: str | None = None           # góp ý của AI dev khi chạy lại
    feedback_step: StepName | None = None # bước bắt đầu chạy lại
    revision: int = 0                     # số lần chạy lại theo góp ý
    redactions: dict[str, int] = {}       # loại PII -> số lượng đã che
    proposal_edited: bool = False         # proposal đã được người sửa tay
    translations: dict[str, str] = {}     # ngôn ngữ -> proposal đã dịch
```

### 4.2 REST API (prefix `/api`)

| Method + path | Request body | Response | Lỗi |
| --- | --- | --- | --- |
| `POST /runs` | `{"request_text": str}` (30–20.000 ký tự) | `201 {"run_id": str}` | `422` nếu ngắn/dài quá |
| `GET /runs/{id}/stream` | — | SSE (mục 4.3) | `404`; `409` nếu status là `running` |
| `POST /runs/{id}/answers` | `{"answers": {question_id: str}}` | `200 ScopingRun` | `409` nếu status khác `waiting_clarification` |
| `GET /runs/{id}` | — | `200 ScopingRun` | `404` |
| `GET /runs?limit=50` | — | `200 list[RunSummary]` | — |
| `POST /runs/{id}/review` | `{"approved": bool, "note": str \| null}` | `200 ScopingRun` | `409` nếu status khác `done` |
| `GET /runs/{id}/proposal.md` | — | `200 text/markdown` | `409` nếu chưa có proposal |
| `GET /health` | — | `{"ok": true, "llm_provider": str}` | — |
| `POST /runs/{id}/rerun` | `{"from_step": StepName, "feedback": str}` (5–2.000 ký tự) | `200 ScopingRun` (status `created`, xóa kết quả từ `from_step`) | `409` nếu status không thuộc `done`, `rejected`, `failed`; `422` |
| `PUT /runs/{id}/proposal` | `{"markdown": str, "title": str \| null}` | `200 ScopingRun` (`proposal_edited = true`, xóa `translations`) | `409` nếu chưa có proposal hoặc status không thuộc `done`, `rejected` |
| `POST /runs/{id}/proposal/translate` | `{"language": "vi"\|"en"\|"ja"}` | `200 {"language", "markdown"}` (cache trong `translations`) | `409` chưa có proposal; `502` LLM lỗi |
| `POST /documents/extract` | multipart `file` (.pdf/.txt/.md, ≤ 10 MB) | `200 {"filename", "text", "pages", "truncated"}` (cắt 20.000 ký tự) | `422` sai định dạng, PDF scan/lỗi |
| `POST /runs/{id}/attachments` | multipart `files[]` + `kinds[]` (`auto`\|`requirements`\|`document`\|`data_sample`\|`source_code`), tối đa 10 file, mỗi file ≤ 20 MB | `200 ScopingRun` | `409` nếu đã bắt đầu phân tích; `422` file lỗi/không hỗ trợ (thông báo kèm tên file) |
| `DELETE /runs/{id}/attachments/{att_id}` | — | `200 ScopingRun` | `409` nếu đã bắt đầu; `404` |
| `GET /runs/{id}/export/{name}` | `name` ∈ `slides.pptx`, `proposal.docx`, `workbook.xlsx`, `package.zip` | file tải về | `409` chưa có proposal; `404` tên không hợp lệ |
| `POST /runs` (mở rộng) | thêm `project_name`, `client_name`, `due_date` (tùy chọn) | như cũ | như cũ |
| `PATCH /runs/{id}/meta` | `{project_name?, client_name?, due_date?, deal_stage?}` | `200 ScopingRun` | `404`; `422` |
| `POST /runs/{id}/quotation` | `{currency?, contingency_pct?, contract_model?, onsite_ratio?}` | `200 ScopingRun` (tính lại báo giá, xóa duyệt giá) | `409` chưa có WBS hoặc giá đã duyệt |
| `POST /runs/{id}/pricing-approval` | `{approved, note?}` (note bắt buộc khi `approved=false`) | `200 ScopingRun` | `409` chưa có báo giá / chưa phân tích xong; `422` |
| `GET\|PUT /runs/{id}/bid` | PUT: `{checks: {criterion_id: bool\|null}, decision: "bid"\|"no_bid"\|null, note?}` | `200 {criteria[], score, answered, recommendation, decision, note, decided_at}` | `422` tiêu chí không tồn tại |
| `POST /runs/{id}/versions` | `{note?, major?, sent?}` | `200 ScopingRun` (thêm 1.0 → 1.1 → 2.0, lưu snapshot proposal) | `409` chưa có proposal |
| `PATCH /runs/{id}/versions/{version}` | `{sent}` | `200 ScopingRun` | `404` |
| `GET /runs/{id}/case-studies` | — | `200 list[CaseStudy + score + reasons]` (tối đa 3, chỉ `public`) | `404` |
| `PUT /settings/company`, `/settings/content-library`, `/settings/case-studies`, `/settings/bid-criteria` | JSON đầy đủ | `200` bản đã lưu | `422` sai ràng buộc / trùng mã |
| `GET /templates` | — | `200 {items: [{kind, filename, active, sample, custom}], config}` | — |
| `GET /templates/{kind}/{sample\|custom}/file` | — | file template | `404` |
| `POST /templates/{kind}` | multipart `file` | `200 {warnings, items, config}` (lưu `templates/custom/`, chọn làm active) | `422` sai định dạng / không mở được |
| `DELETE /templates/{kind}/custom` | — | `200` (active quay về `sample`) | `404` |
| `PUT /templates/active`, `PUT /templates/config` | `{kind, source}` / `{pptx, workbook, qa_sheet}` | `200` như `GET /templates` | `409` chưa upload; `422` |
| `POST /runs/{id}/client-email` | `{sender_name?, regenerate?}` | `200 {subject, body}` (cache trong `client_email`) | `409` chưa có câu hỏi; `502` LLM lỗi |
| `POST /runs/{id}/answers/import` | multipart `file` (Q&A sheet đã điền) | `200 ScopingRun` (như `/answers`) | `409` không chờ làm rõ; `422` file sai/không có câu trả lời |
| `GET /runs/{id}/export/qa_sheet.xlsx` | — | file Q&A theo ngôn ngữ khách | `409` chưa có câu hỏi |
| `GET /runs/{id}/export/{slides.pptx\|package.zip}?lang=vi\|en\|ja` | — | slide theo ngôn ngữ (nội dung dịch bằng LLM, cache `deck_translations`) | `422` ngôn ngữ sai; `502` dịch lỗi |
| `GET /runs/{id}/similar` | — | `200 list[RunSummary + score]` (tối đa 3) | `404` |
| `GET /stats` | — | `200 {runs, finished, stages, win_rate, hours_saved, manual_hours_per_proposal, review_hours_per_proposal}` | — |
| `GET /settings` | — | `200 {rate_card, estimation_template, reference_projects, company, content_library, case_studies, bid_criteria}` | — |
| `PUT /settings/rate-card`, `PUT /settings/estimation-template` | JSON đầy đủ | `200` bản đã lưu (ghi YAML trong `knowledge_base/`) | `422` sai ràng buộc |
| `PUT\|DELETE /settings/reference-projects/{name}` | `{content}` | `200` | `422`; `404` |
| `GET /replays/{name}/export/{file}` | — | xuất hồ sơ từ `final_run` lưu trong replay | `409` replay cũ không có `final_run` |
| `GET /eval/reports` | — | `200 list[{name, provider, label, created_at, summary}]` | — |
| `GET /eval/reports/{name}` | — | `200 {..., cases}` (bỏ `outputs`) | `404` |
| `GET /replays` | — | `200 list[str]` (tên các bản replay) | — |
| `GET /replays/{name}` | — | `200 {name, llm_provider, recorded_at, request_text, segments: [{answers}]}` | `404` |
| `GET /replays/{name}/stream?segment=0&speed=1` | — | SSE (mục 4.3), phát lại với độ trễ đã ghi | `404` |

`RunSummary = {id, created_at, status, business_goal | null, pattern | null}`. Lỗi luôn có dạng `{"detail": "<thông báo tiếng Việt>"}`.

### 4.3 Sự kiện SSE

`GET /runs/{id}/stream` chạy pipeline từ bước chưa có kết quả (bỏ qua bước đã xong), và phát các sự kiện theo thứ tự:

| `event` | `data` (JSON) | Khi nào |
| --- | --- | --- |
| `step_started` | `{"step": StepName}` | Trước khi gọi LLM cho bước đó |
| `step_done` | `{"step": StepName, "result": <schema của bước>, "latency_ms": int}`; riêng `architecture` có thêm `"effort_basis": EffortBasis \| null`, riêng `wbs` có thêm `"schedule": Schedule, "quotation": Quotation \| null` | Bước xong và đã lưu DB |
| `status` | `{"status": RunStatus}` | Khi status đổi (`running`, `waiting_clarification`, `done`) |
| `run_error` | `{"step": StepName, "message": str}` | Bước thất bại sau hết retry; status → `failed`; stream đóng |

`StepName = "intake" | "gaps" | "pattern" | "feasibility" | "architecture" | "wbs" | "requirements" | "proposal"`. Stream đóng sau `status` = `waiting_clarification` hoặc `done`, hoặc sau `run_error`. Dùng tên `run_error` (không dùng `error`) để tránh trùng sự kiện lỗi kết nối mặc định của `EventSource`.

### 4.4 Lưu trữ

SQLite, một bảng: `runs(id TEXT PRIMARY KEY, created_at TEXT, status TEXT, data TEXT)` với `data = ScopingRun.model_dump_json()`. `repo.py` cung cấp: `save(run)`, `get(id) -> ScopingRun | None`, `list_recent(limit) -> list[RunSummary]`.

### 4.5 Type frontend

`frontend/src/types.ts` phản chiếu 1:1 các schema trên (tên trường snake\_case giữ nguyên). Không đổi sang camelCase.

## 5. Hành vi pipeline

### 5.1 Step engine (`agents/step.py`)

Mỗi bước là một instance `Step(name, prompt_file, output_model, kb_keys, max_retries=2)`. `Step.run(llm, context) -> (result, latency_ms)` làm đúng thứ tự:

1. **System prompt** = nội dung file prompt, thay `{{knowledge}}` bằng nội dung KB theo `kb_keys`, nối thêm đoạn: "Chỉ trả về MỘT object JSON hợp lệ theo JSON Schema sau, không kèm giải thích:" + `output_model.model_json_schema()`.
2. **User message** = `context` serialize JSON (`ensure_ascii=False`).
3. Gọi `llm.complete(system, user)`.
4. **Extract JSON:** bỏ code fence, lấy đoạn từ `{` đầu tiên đến `}` cuối cùng, `json.loads`.
5. **Validate** bằng `output_model.model_validate`, sau đó chạy `post_validate` riêng của bước (nếu có).
6. Lỗi ở bước 4–5 → retry, user message thêm dòng `Lần trước output không hợp lệ: <lỗi, tối đa 500 ký tự>. Hãy trả lại JSON đúng schema.` Hết retry → raise `StepError(step, message)`.
7. Ghi log mỗi lần gọi: step, attempt, latency, độ dài output (không log toàn văn yêu cầu khách).

### 5.2 Từng bước

| Bước | Context đầu vào | KB | `post_validate` trong code |
| --- | --- | --- | --- |
| `intake` | `request_text` | — | `business_goal` không rỗng |
| `gaps` | `request_text`, `intake`, `answers` | `risk_checklist`, `solution_patterns` (chỉ `key_questions`) | Ghi đè `can_proceed = not any(blocking)`; đánh lại `id` thành `q1..qn` nếu trùng |
| `pattern` | `intake`, `gaps`, `answers` | `solution_patterns` | `pattern` không nằm trong `rejected`; nếu `confidence = high` thì `rejected` có ≥ 2 mục |
| `feasibility` | `intake`, `pattern`, `answers` | `risk_checklist` | `risks` sắp xếp severity giảm dần |
| `architecture` | `intake`, `pattern`, `feasibility`, `computed_estimates` | `reference_projects` | Mỗi phase: `min ≤ max`; lệch quá ±20% so với `computed_estimates` mà thiếu `adjustment_note` → lỗi |
| `wbs` | `pattern`, `architecture`, `feasibility.risks` | — | id duy nhất; `depends_on` tồn tại, không phụ thuộc giai đoạn sau, không vòng; tổng ngày công mỗi phase nằm trong `[min, max]` của `architecture.estimates`. Sau đó code tính `schedule` |
| `requirements` | `pattern`, `architecture.components`, lô ≤ 40 requirement | — | Mỗi `req_id` của lô xuất hiện đúng một lần. Không có file requirement → `skipped = true`, không gọi LLM |
| `proposal` | toàn bộ kết quả trước đó + `wbs_summary`, `timeline`, `requirements_summary` | — | `markdown` chứa các heading `Giả định` và `Rủi ro` |

### 5.3 Điều khiển luồng (`agents/pipeline.py`)

`run_pipeline(llm, run, repo)` là async generator phát các sự kiện ở mục 4.3:

1. Đặt `status = running`, phát `status`.
2. Chạy lần lượt 8 bước, **bỏ qua bước đã có kết quả** trong `run`. Mỗi bước: phát `step_started` → chạy → lưu vào `run` + `step_latency_ms` → `repo.save(run)` → phát `step_done`.
3. Sau `gaps`: nếu `can_proceed = false` **và** `run.answers đang rỗng (chỉ dừng tối đa một lần; lần chạy sau đã có câu trả lời thì đi tiếp và ghi phần còn thiếu vào assumptions)` → `status = waiting_clarification`, lưu, phát `status`, kết thúc.
4. Trước `architecture`: gọi `compute_estimates(run.pattern, run.intake, run.feasibility)` và đưa vào context.
5. Xong `proposal` → `status = done`, lưu, phát `status`.
6. `StepError` → `status = failed`, `run.error = message`, lưu, phát `run_error`.

**Khi người dùng gửi `answers`:** gộp vào `run.answers`, **xóa `run.gaps`** (để bước gaps chạy lại với câu trả lời), đặt `status = created`. Frontend sau đó mở lại stream; `intake` được bỏ qua vì đã có.

### 5.3b Hành vi bổ sung

- **Che PII** (`app/privacy.py`, bật bằng `PII_MASKING`): `request_text`, `answers` và `feedback` được thay email/số điện thoại/link bằng `[EMAIL_1]`, `[PHONE_1]`, `[URL_1]` trước khi vào context LLM; dữ liệu gốc vẫn lưu trong DB; số lượng ghi vào `run.redactions`.
- **Chạy lại theo góp ý:** `POST /runs/{id}/rerun` xóa kết quả từ `from_step` trở đi; context của bước đó và các bước sau có thêm `reviewer_feedback`; mọi prompt có quy tắc làm theo góp ý.
- **Thử lại lỗi mạng:** `RetryingLLM` bọc client thật (không bọc mock); khác với retry lỗi schema của `Step`.
- **Khởi động server:** các run kẹt ở `running` được đưa về `created` để chạy tiếp.
- **Compliance theo thị trường:** intake gắn `market_vn` / `market_jp` / `market_eu` vào `constraints`; feasibility dùng thêm KB `compliance_markets`.
- **Sơ đồ:** architecture sinh `mermaid` (`flowchart LR`); `post_validate` bỏ code fence, đặt `null` nếu không phải flowchart (không retry).
- **Dịch proposal:** step `translate` (`prompts/07_translate.md`) chạy khi người dùng bấm, không nằm trong pipeline.
- **File đính kèm (`app/ingest/`, thuần code):** Excel/CSV có cột mô tả yêu cầu → `requirements`; bảng khác → `data_sample` (profile kiểu cột, % trống, nghi PII, `readiness_hint`); .pdf/.docx/.txt/.md → `document`; .zip → `source_code` (ngôn ngữ, số dòng, framework, có test/Docker; bỏ qua node_modules, .git…; giới hạn 5.000 file, 100 MB giải nén).
- **Ngân sách context:** `app/ingest/digest.py` gộp tài liệu (tổng ≤ 16.000 ký tự), 40 requirement mẫu, profile dữ liệu và code; đã che PII. Toàn văn tài liệu chỉ vào `intake`, `gaps`; `pattern`/`feasibility`/`architecture` chỉ nhận phần tóm tắt.
- **Xuất hồ sơ (`app/exports/`, thuần code):** slide `.pptx` (sơ đồ kiến trúc và Gantt bằng shape chỉnh sửa được), `.docx` (proposal + phụ lục), `.xlsx` (effort bằng công thức Excel, WBS, timeline, bảng đáp ứng, rủi ro, profile dữ liệu), `.zip` trọn bộ.
- **Mock:** `MockLLM` tự sinh WBS (khớp effort), bảng đáp ứng (đủ mọi `req_id`), email gửi khách (theo mẫu 3 ngôn ngữ) và bản dịch slide (giữ nguyên chuỗi) từ context (`app/llm/mock_generators.py`).
- **Báo giá (`agents/pricing.py`, thuần code):** ngày công từng task WBS × đơn giá vai trò (`knowledge_base/rate_card.yaml`, ghép vai trò theo từ khóa); khoảng min–max = khoảng effort × đơn giá bình quân của phase; dự phòng = cơ bản + % mỗi rủi ro mức ≥ 4 (có trần); chi phí vận hành/tháng theo pattern (× hệ số on-prem); mốc thanh toán theo %. Tiền tệ mặc định theo ngôn ngữ khách (vi→VND, ja→JPY, en→USD). Tính sau bước `wbs`; `rerun` từ `wbs` trở về trước xóa báo giá.
- **Giai đoạn deal (`app/deal.py`):** tự theo trạng thái (`waiting_clarification`→`clarifying`, `done`/`rejected`→`reviewing`, `approved`→`ready`) cho tới khi người dùng chọn `sent`/`won`/`lost`.
- **Email gửi khách:** step `client_email` (`prompts/10_client_email.md`), chạy khi bấm. Tên khách và người gửi được code điền vào placeholder, không gửi cho LLM.
- **Q&A sheet (`exports/qa_sheet.py`):** xuất câu hỏi theo ngôn ngữ khách (cột ID + cột trả lời tô vàng); nhập lại file đã điền → gộp vào `answers` như `/answers`.
- **Slide đa ngôn ngữ:** nhãn cố định trong `exports/i18n.py`; nội dung agent viết được dịch bằng step `translate_items` (`prompts/11_translate_items.md`, kiểm tra đúng số phần tử), cache theo run.
- **Hồ sơ tương tự (`app/similar.py`):** điểm = pattern trùng (0,4) + Jaccard mục tiêu (0,25) + ngành (0,15) + ràng buộc (0,1) + ngôn ngữ (0,1); ngưỡng 0,25.
- **Báo giá chuẩn công ty:** overhead theo % ngày công WBS từng giai đoạn (PM luôn có; BrSE khi khách tiếng Nhật) thành dòng `kind="overhead"`; đơn giá = offshore × (1 − onsite%) + onsite × onsite%. Ba mô hình: `fixed_price` (dự phòng + mốc thanh toán), `time_material` (không dự phòng, thanh toán theo tháng), `odc` (FTE theo vai trò làm tròn 0,5, chi phí/tháng × số tháng của timeline).
- **Phê duyệt 2 cấp (`app/deal.py`):** `approved` (kỹ thuật) chỉ chuyển deal sang `ready` khi có `pricing_approval.approved` (nếu run có báo giá). Sửa báo giá hoặc `rerun` xóa duyệt giá; giá đã duyệt thì khóa sửa.
- **Bid/No-bid (`app/bid.py`):** tiêu chí trong `knowledge_base/bid_criteria.yaml`; tiêu chí `auto` được code gợi ý từ kết quả phân tích, người xác nhận ghi đè. Điểm = % trọng số đạt; < 60% trọng số đã đánh giá → `need_info`, ≥ 70 → `bid`, ≥ 50 → `consider`, còn lại `no_bid`. Quyết định `no_bid` đặt deal `no_bid`.
- **Phiên bản & tên file:** `versions` đánh số 1.0/1.1/2.0, lưu snapshot proposal; `sent=true` đặt deal `sent`. Tên file xuất theo `company.yaml → file_naming` (`{company}_{client}_{project}_{doc}_v{version}_{date}`), header `Content-Disposition` có `filename*` UTF-8 (RFC 5987).
- **Chuẩn công ty trong hồ sơ (thuần code, LLM không viết lại):** `content_library.yaml` (khối `start` sau bìa, `end` trước phụ lục; theo ngôn ngữ khách, thiếu thì dùng tiếng Việt; placeholder `{{company_name}}`…); `case_studies.yaml` (`app/company.py → match_case_studies`: pattern 0,5 + thị trường 0,2 + ngành 0,2 + từ khóa ≤ 0,1, ngưỡng 0,45, chỉ `public`) vào slide, Word và context bước proposal (tối đa 2, chỉ tên + kết quả).
- **Template công ty (`app/templates_store.py`, `app/exports/templating.py`):** mỗi loại (`slides`, `proposal_docx`, `workbook`, `qa_sheet`) chọn `builtin` (thiết kế ScopeAI), `sample` (bộ mẫu trung tính "Công ty ABC (mẫu)" sinh bằng `app/exports/sample_templates.py`) hoặc `custom` (file upload, kiểm tra trước khi lưu). PowerPoint: bìa dùng layout "Title Slide", nội dung dùng layout cấu hình (mặc định "Title Only"), vùng vẽ = ô `{{SCOPEAI_CONTENT}}` (bị xóa khi xuất) hoặc tính từ tiêu đề; màu bảng/sơ đồ lấy `accent1` của theme. Word: thân bài chèn tại đoạn `{{SCOPEAI_BODY}}`. Excel: ghi WBS/báo giá/Q&A theo `SheetMapping` (sheet, dòng bắt đầu, cột), giữ công thức của template; nhập lại Q&A theo cùng mapping. Placeholder `{{company_name}}`, `{{client_name}}`, `{{project_name}}`, `{{proposal_title}}`, `{{date}}`, `{{version}}`… được điền ở mọi nơi.
- **Cài đặt (`app/settings_store.py`):** đọc/ghi `rate_card.yaml`, `estimation_template.yaml`, `reference_projects/*.md`, validate bằng `schemas/settings.py` trước khi ghi.

### 5.4 Tính effort (`agents/estimate.py`)

`compute_estimates(pattern, intake, feasibility) -> dict[Phase, tuple[int, int]]`:

- Đọc `knowledge_base/estimation_template.yaml` (`base[pattern][phase] = [min, max]`, `multipliers`).
- `pattern = needs_clarification` hoặc không có trong `base` → trả `{}`.
- Hệ số nhân dồn: `"on_prem"` trong `intake.constraints` → `on_prem`; `intake.language == "ja"` → `japanese_language`; `feasibility.data_readiness <= 2` → `low_data_readiness`; `"strict_compliance"` trong constraints → `strict_compliance`.
- Kết quả = `round(min × m)`, `round(max × m)`. Hàm thuần, không gọi LLM.

### 5.5 Knowledge loader

`kb_text(keys: list[str]) -> str` đọc các file trong `knowledge_base/`, nối với tiêu đề `### <tên file>`. Cache trong bộ nhớ; có hàm `reload()` cho dev. KB tổng dưới 30.000 ký tự, không chunk, không embedding.

## 6. Task list

Làm theo đúng thứ tự; mỗi task chỉ bắt đầu khi task trước đã qua bước Verify. Task đánh dấu **\[Người\]** có phần do chủ dự án tự làm; AI chỉ tạo khung.

- [x] T01 – Khởi tạo backend
- [x] T02 – Schema
- [x] T03 – Lớp LLM (VibeFlow vẫn chờ BTC cung cấp cách gọi)
- [x] T04 – Knowledge base và loader **\[Người\]** (KB là bản nháp, cần review)
- [x] T05 – Step engine
- [x] T06 – Prompt 6 bước **\[Người\]** (bản nháp, cần tinh chỉnh theo eval thật)
- [x] T07 – Tính effort
- [x] T08 – Pipeline
- [x] T09 – Storage
- [x] T10 – API và SSE
- [x] T11 – Evaluation **\[Người\]** (30 case, đáp án kỳ vọng là bản nháp cần review)
- [x] T12 – Khởi tạo frontend
- [x] T13 – Trang Nhập yêu cầu
- [x] T14 – Trang Kết quả
- [x] T15 – Làm rõ, duyệt, lịch sử
- [x] T16 – Replay, README, hoàn thiện (replay hiện ghi bằng mock, cần ghi lại bằng LLM thật)
- [x] T17 – Hiển thị công thức effort (`effort_basis`)
- [x] T18 – Thử lại lỗi mạng + khôi phục run kẹt khi khởi động
- [x] T19 – Upload PDF (`/documents/extract`)
- [x] T20 – Chạy lại từ một bước theo góp ý của AI dev
- [x] T21 – Che PII trước khi gửi LLM
- [x] T22 – Sửa proposal trực tiếp + dịch proposal (song ngữ)
- [x] T23 – Compliance theo thị trường VN/JP/EU
- [x] T24 – Sơ đồ kiến trúc Mermaid
- [x] T25 – Trang Đánh giá (`/eval`) + `python -m eval.summary` → `docs/eval_summary.md`
- [x] T26 – So sánh 2 phiên (`/compare`)
- [x] T27 – Đính kèm nhiều file: Excel requirement, PDF/DOCX, data mẫu, source code (`app/ingest/`)
- [x] T28 – Bước WBS + timeline tính bằng code (`agents/schedule.py`)
- [x] T29 – Bước bảng đáp ứng yêu cầu (chia lô, kiểm tra đủ dòng)
- [x] T30 – Xuất slide `.pptx`, Word `.docx`, Excel `.xlsx`, gói `.zip` (`app/exports/`)
- [x] T31 – Tải sơ đồ kiến trúc SVG/PNG, Copy Mermaid
- [x] T32 – Báo giá sơ bộ (WBS × đơn giá, dự phòng, vận hành/tháng, mốc thanh toán, VND/JPY/USD) trên web, slide, Word, Excel
- [x] T33 – Email gửi khách + Q&A sheet (xuất và nhập lại câu trả lời)
- [x] T34 – Quản lý hồ sơ: tên dự án, khách hàng, hạn nộp, giai đoạn deal; Lịch sử có tìm kiếm/lọc/sắp xếp
- [x] T35 – Trang Cài đặt (đơn giá, bảng effort, dự án tham chiếu)
- [x] T36 – Thống kê tác động (giờ tiết kiệm, tỉ lệ thắng)
- [x] T37 – Slide theo ngôn ngữ khách (VI/EN/JA)
- [x] T38 – Replay kèm file đính kèm + xuất hồ sơ offline; gợi ý hồ sơ tương tự
- [x] T39 – Báo giá chuẩn công ty: overhead PM/BrSE, đơn giá onsite/offshore, mô hình Trọn gói / T&M / ODC
- [x] T40 – Template công ty (slide, Word, Excel ước tính, Excel Q&A): bộ mẫu trung tính + upload template riêng có kiểm tra + cấu hình ghép
- [x] T41 – Thư viện nội dung chuẩn và case study, tự chèn vào slide/Word theo ngôn ngữ khách
- [x] T42 – Bid/No-bid checklist có gợi ý tự động
- [x] T43 – Phê duyệt 2 cấp (kỹ thuật + giá), phiên bản gửi khách, quy tắc đặt tên file
- [x] T44 – Cài đặt: Công ty, Template, Nội dung chuẩn, Case study, Bid/No-bid; tab "Quy trình & phê duyệt" trên trang hồ sơ

### T01 – Khởi tạo backend

- **Làm:** `requirements.txt`, `requirements-dev.txt`, `pyproject.toml` (cấu hình ruff, pytest `asyncio_mode = "auto"`), `.env.example` (mục 3.3), `app/config.py` (class `Settings` đọc env), `app/main.py` với CORS và `GET /api/health`, `.gitignore` (`.env`, `.venv`, `*.db`, `eval/reports/`).
- **Xong khi:** server chạy; `/api/health` trả `{"ok": true, "llm_provider": "mock"}`.
- **Verify:** `uvicorn app.main:app --port 8000` rồi `curl localhost:8000/api/health`; `ruff check .`

### T02 – Schema

- **Làm:** toàn bộ file trong `app/schemas/` đúng mục 4.1; `RunSummary`; `tests/fixtures/valid_<step>.json` (6 file, mỗi file một output hợp lệ, dữ liệu giả lập); `tests/test_schemas.py`.
- **Xong khi:** 6 fixture validate được; các case sai bị từ chối: `severity = 7`, `pattern = "magic"`, `questions` 8 phần tử, `language = "fr"`.
- **Verify:** `pytest tests/test_schemas.py -q`

### T03 – Lớp LLM

- **Làm:** `llm/base.py`: `class LLMClient(ABC)` với `async complete(system: str, user: str, *, tag: str | None = None) -> str` (`tag` = tên bước, dùng cho mock và log). `llm/mock.py`: `MockLLM(responses: dict[str, list[str]] | None)` trả lần lượt response theo `tag`; mặc định dùng fixture T02. `llm/openai_compat.py`: gọi `POST {LLM_BASE_URL}/chat/completions` bằng `httpx`, timeout theo env. `llm/vibeflow.py`: raise `NotImplementedError("Cần bổ sung cách gọi VibeFlow, xem AGENTS.md mục 3.3")`. `get_llm()` chọn theo `LLM_PROVIDER`.
- **Xong khi:** `MockLLM` trả đúng thứ tự; `get_llm()` trả đúng class; `OpenAICompatClient` được test bằng `httpx.MockTransport` (không gọi mạng).
- **Verify:** `pytest tests/test_llm.py -q`

### T04 – Knowledge base và loader \[Người\]

- **AI làm:** `knowledge/loader.py` (mục 5.5); khung 3 file YAML đúng cấu trúc dưới đây với nội dung `TODO`; 1 file `reference_projects/rp_example.md` mẫu; `tests/test_loader.py`.
- **Người làm:** điền nội dung thật cho 5 pattern, 15–20 rủi ro, bảng effort, 4–6 dự án tham chiếu giả lập.
- **Cấu trúc YAML:** `solution_patterns.yaml` = list `{id, use_when[], avoid_when[], signals[], key_questions[], example}`; `risk_checklist.yaml` = list `{id, category, description, severity_guide, mitigation}`; `estimation_template.yaml` = `{unit, base: {pattern: {poc|mvp|production: [min, max]}}, multipliers: {on_prem, japanese_language, low_data_readiness, strict_compliance}}`.
- **Xong khi:** `kb_text(["solution_patterns"])` trả chuỗi có tiêu đề `### solution_patterns.yaml`; key không tồn tại → `KeyError` rõ ràng.
- **Verify:** `pytest tests/test_loader.py -q`

### T05 – Step engine

- **Làm:** `agents/step.py` đúng mục 5.1, gồm `Step`, `StepError(step, message)`, `extract_json()`; hỗ trợ `post_validate: Callable[[Model], Model] | None`; `tests/test_step.py`.
- **Xong khi:** test pass cho: JSON trong code fence có chữ thừa; sai schema lần 1 đúng lần 2; `post_validate` raise → cũng retry; hết retry → `StepError`; message retry chứa lỗi lần trước; system prompt chứa JSON schema và nội dung KB.
- **Verify:** `pytest tests/test_step.py -q`

### T06 – Prompt 6 bước \[Người\]

- **AI làm:** bản nháp `prompts/01_intake.md` … `06_proposal.md`, mỗi file có các phần: VAI TRÒ, NHIỆM VỤ, QUY TRÌNH SUY LUẬN, QUY TẮC, KIẾN THỨC THAM CHIẾU (`{{knowledge}}`). Phải thể hiện quy tắc cốt lõi: intake không suy diễn (thiếu thì `null`); gaps tối đa 7 câu, viết bằng ngôn ngữ khách, không hỏi lại điều đã có trong `answers`; pattern xét `no_ai_rule_based` đầu tiên và nêu lý do loại từng hướng; architecture dùng `computed_estimates` làm gốc; proposal không thêm thông tin mới.
- **Người làm:** tinh chỉnh dựa trên kết quả T11.
- **Verify:** `grep -L "{{knowledge}}" app/prompts/0[2-5]*.md` không in gì.

### T07 – Tính effort

- **Làm:** `agents/estimate.py` đúng mục 5.4; `tests/test_estimate.py` dùng YAML tạm trong `tmp_path`.
- **Xong khi:** test pass cho: rag cloud tiếng Việt = base; rag on-prem tiếng Nhật = base × on\_prem × japanese\_language; `needs_clarification` → `{}`.
- **Verify:** `pytest tests/test_estimate.py -q`

### T08 – Pipeline

- **Làm:** `agents/steps.py` khai báo 6 `Step` kèm `post_validate` theo mục 5.2; `agents/pipeline.py` đúng mục 5.3; `tests/test_pipeline.py` dùng `MockLLM` và repo in-memory giả.
- **Xong khi:** test pass cho 4 kịch bản: chạy đủ 6 bước → `done` và thứ tự sự kiện đúng; gaps có câu blocking → dừng ở `waiting_clarification`, chưa gọi bước 3; có `answers` → chạy tiếp, không gọi lại intake; bước 4 lỗi liên tục → `run_error` và `failed`.
- **Verify:** `pytest tests/test_pipeline.py -q`

### T09 – Storage

- **Làm:** `storage/repo.py` (mục 4.4) dùng `sqlite3` chuẩn, tự tạo bảng, đường dẫn từ `DB_PATH`; `tests/test_repo.py` dùng `tmp_path`.
- **Xong khi:** save → get trả về object bằng nhau; save hai lần cùng id là cập nhật; `list_recent` mới nhất trước.
- **Verify:** `pytest tests/test_repo.py -q`

### T10 – API và SSE

- **Làm:** toàn bộ endpoint mục 4.2 và stream mục 4.3 trong `app/main.py` (dùng `sse-starlette`); dependency injection cho `get_llm` và `repo` để test override; `tests/test_api.py` dùng `TestClient` + `MockLLM`.
- **Xong khi:** test pass cho mọi mã lỗi trong bảng 4.2; stream với mock trả đúng chuỗi `status, step_started, step_done ×6, status`.
- **Verify:** `pytest -q` (toàn bộ xanh); thử tay: `curl -N localhost:8000/api/runs/<id>/stream`

### T11 – Evaluation \[Người\]

- **AI làm:** `eval/run_eval.py`, `eval/metrics.py`, 3 case mẫu `case_01.yaml` (rag), `case_10.yaml` (no\_ai\_rule\_based), `case_13.yaml` (needs\_clarification). Định dạng case: `{id, request_text, expected: {pattern, acceptable_patterns[], question_topics[], can_proceed, mvp_person_days: [min, max] | null, must_not_mention[]}}`. Metric: pattern accuracy, topic recall, estimate in range, schema success rate (số bước không cần retry), latency trung bình. Case dừng ở `waiting_clarification` được tính `pattern = needs_clarification`. Ghi `eval/reports/eval_<MMDD_HHMM>.json` và `.md` (bảng từng case + tóm tắt). Chạy tuần tự; `--case case_01` để chạy một case.
- **Người làm:** viết 12 case còn lại và đáp án kỳ vọng.
- **Xong khi:** `LLM_PROVIDER=mock python -m eval.run_eval` chạy hết, sinh report; `tests/test_metrics.py` pass.
- **Verify:** `pytest tests/test_metrics.py -q && LLM_PROVIDER=mock python -m eval.run_eval`

### T12 – Khởi tạo frontend

- **Làm:** Vite React TS, Tailwind, `react-router-dom` với route `/`, `/runs/:id`, `/history`; layout có header "ScopeAI" và link Lịch sử; `src/types.ts` (mục 4.5); `src/api.ts` gồm `createRun`, `getRun`, `listRuns`, `postAnswers`, `postReview`, `proposalUrl`, `streamRun(id, handlers) -> () => void` dùng `EventSource` với các sự kiện mục 4.3. `VITE_API_BASE` mặc định `http://localhost:8000/api`.
- **Xong khi:** `npm run build` không lỗi type; 3 route hiển thị placeholder.
- **Verify:** `npm run build`

### T13 – Trang Nhập yêu cầu

- **Làm:** textarea lớn (đếm ký tự, tối thiểu 30), nút upload `.txt`/`.md` đọc vào textarea, 3 nút "Dùng mẫu" lấy từ `src/samples.ts` (nội dung = `request_text` của case 01, 10, 13), nút **Phân tích** → `createRun` → điều hướng tới `/runs/:id`. Trạng thái loading và lỗi hiển thị tiếng Việt.
- **Xong khi:** bấm mẫu → Phân tích → sang trang kết quả với backend thật chạy mock.
- **Verify:** `npm run build` + thử tay

### T14 – Trang Kết quả

- **Làm (đã cập nhật theo quyết định chủ dự án, 03/10):** giao diện kiểu app làm việc, mặc định nền sáng, có nút chuyển sáng/tối (lưu trong trình duyệt, token màu theo vai trò trong `index.css`). Khung app có menu trái (Tạo hồ sơ, Hồ sơ, Đánh giá, Cài đặt). Trang hồ sơ: đầu trang gọn (tên dự án sửa tại chỗ, khách hàng, hạn nộp, giai đoạn deal, trạng thái, nút Tải hồ sơ / Yêu cầu sửa / Duyệt), thanh tiến trình 8 bước nằm ngang, 7 tab: **Tổng quan** (tóm tắt một màn hình), **Yêu cầu & câu hỏi**, **Giải pháp**, **Kế hoạch & báo giá**, **Đáp ứng yêu cầu**, **Proposal & hồ sơ**, **Quy trình & phê duyệt** (Bid/No-bid, duyệt kỹ thuật + duyệt giá, phiên bản gửi khách). Đầu trang có huy hiệu KT ✓ / Giá ✓ và số phiên bản. Khi chờ làm rõ tự chuyển sang tab câu hỏi; tab lưu trong URL (`?tab=`). Khi mở lại run đã xong: gọi `getRun`, không mở stream. Chữ body 14px (khi trình chiếu dùng zoom trình duyệt 115–125%). Không dùng hiệu ứng trang trí (glow, gradient); chỉ giữ chuyển động chức năng.
- **Xong khi:** với mock, 6 card lần lượt xuất hiện và timeline cập nhật đúng; reload trang vẫn hiển thị đủ.
- **Verify:** `npm run build` + thử tay

### T15 – Làm rõ, duyệt, lịch sử

- **Làm:** khi `waiting_clarification`, `QuestionList` hiện ô trả lời cho từng câu và nút **Tiếp tục phân tích** (→ `postAnswers` → mở lại stream). `ReviewBar` cố định đáy khi `done`: ô ghi chú, nút **Duyệt** / **Yêu cầu sửa**; sau khi duyệt, ProposalCard có dấu "Đã duyệt bởi AI dev". Trang `/history`: bảng thời gian, mục tiêu, pattern, trạng thái; bấm hàng → mở run.
- **Xong khi:** case mơ hồ (mock) đi hết luồng dừng → trả lời → chạy tiếp → duyệt.
- **Verify:** `npm run build` + thử tay

### T16 – Replay, README, hoàn thiện

- **Làm:** script `eval/record_replay.py --case case_01` chạy pipeline thật và lưu chuỗi sự kiện kèm `latency_ms` vào `backend/replays/<case>.json`; endpoint mới `GET /api/replays/{name}/stream` phát lại sự kiện với độ trễ đã ghi (bổ sung vào bảng mục 4.2); frontend: route `/replay/:name` dùng cùng trang Kết quả. README: giới thiệu, kiến trúc, cách chạy, cách chạy eval, giới hạn.
- **Xong khi:** tắt mạng vẫn demo được 3 case qua `/replay/...`; `pytest -q` và `npm run build` đều xanh.
- **Verify:** như trên

## 7. Prompt mẫu để giao việc cho AI

Năm prompt này phủ gần hết tình huống khi vibecode; copy, thay phần trong `< >` rồi gửi.

**Mở đầu phiên làm việc**

```
Đọc toàn bộ AGENTS.md. Chưa viết code. Tóm tắt cho tôi trong 5 gạch đầu dòng:
mục tiêu sản phẩm, 3 quy tắc quan trọng nhất, và task tiếp theo cần làm
(task đầu tiên chưa được tick trong mục 6). Nếu thấy điểm nào trong spec mâu thuẫn
hoặc thiếu, liệt kê ra.
```

**Giao một task**

```
Làm task <T05> trong AGENTS.md.
1. Liệt kê các file sẽ tạo/sửa và cách tiếp cận trong tối đa 6 dòng, rồi làm luôn.
2. Chỉ làm trong phạm vi task này, tuân thủ mục 2 và contract mục 4.
3. Chạy lệnh Verify của task và dán kết quả thật.
4. Kết thúc bằng: danh sách file đã thay đổi, giả định đã đưa ra, điều tôi cần kiểm tra tay.
```

**Sửa lỗi**

```
Lệnh <pytest tests/test_pipeline.py -q> đang lỗi như sau:
<dán log lỗi>
Tìm nguyên nhân gốc trước, giải thích trong 2–3 câu, rồi sửa. Không sửa test để cho
pass trừ khi test sai so với AGENTS.md; nếu vậy thì chỉ rõ test sai ở đâu.
```

**Review trước khi commit**

```
Review các thay đổi chưa commit (git diff) so với AGENTS.md. Kiểm tra: đúng contract
mục 4, không gọi LLM thật trong test, không hardcode key, không thêm dependency ngoài
mục 3.1, text giao diện tiếng Việt. Chỉ báo vấn đề, xếp theo mức nghiêm trọng; chưa sửa.
```

**Phân tích kết quả eval để chỉnh prompt**

```
Đây là report eval mới nhất: <đường dẫn eval/reports/...md>.
Với mỗi case sai pattern hoặc thiếu topic câu hỏi, đọc output của bước liên quan và đoán
vì sao sai. Đề xuất tối đa 3 thay đổi cụ thể cho file prompt (dạng diff), mỗi thay đổi
kèm case nó nhắm sửa và rủi ro làm hỏng case đang đúng. Chưa sửa file.
```

Giữ nguyên tắc: một phiên chat cho một task. Khi phiên quá dài hoặc AI bắt đầu quên quy tắc, mở phiên mới và bắt đầu lại bằng prompt "Mở đầu phiên".
