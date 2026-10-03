import asyncio
import json
import logging
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from pydantic import BaseModel, Field, ValidationError
from sse_starlette.sse import EventSourceResponse

from app.agents.pipeline import Event, reset_from, run_pipeline
from app.agents.pricing import compute_quotation, load_rate_card
from app.agents.step import StepError
from app.agents.steps import CLIENT_EMAIL, TRANSLATE
from app.bid import evaluate_bid, load_bid_criteria
from app.company import (
    content_disposition,
    export_filename,
    load_case_studies,
    load_company,
    match_case_studies,
)
from app.config import BACKEND_DIR, get_settings
from app.deal import MANUAL, sync_deal_stage
from app.documents import DocumentError, extract_text
from app.exports.document import build_docx
from app.exports.package import build_package
from app.exports.qa_sheet import build_qa_sheet, parse_qa_answers
from app.exports.slides import build_slides
from app.exports.translation import ensure_deck_translations
from app.exports.workbook import build_workbook
from app.ingest import KINDS, MAX_ATTACHMENTS, build_attachment
from app.llm.base import LLMClient, get_llm
from app.schemas.common import Language, StepName
from app.schemas.deal import (
    BidDecision,
    ClientEmail,
    DealStage,
    PricingApproval,
    ProposalVersion,
)
from app.schemas.quotation import ContractModel, Currency
from app.schemas.run import RunStatus, RunSummary, ScopingRun
from app.schemas.settings import TemplateKind, TemplatesConfig, TemplateSource
from app.settings_store import (
    delete_reference_project,
    read_settings,
    save_bid_criteria,
    save_case_studies,
    save_company,
    save_content_library,
    save_estimation_template,
    save_rate_card,
    save_reference_project,
)
from app.similar import find_similar
from app.storage.repo import RunRepo
from app.templates_store import (
    FILES as TEMPLATE_FILES,
)
from app.templates_store import (
    ExportKit,
    TemplateError,
    delete_custom,
    list_templates,
    load_templates_config,
    resolve,
    save_custom,
    save_templates_config,
    set_active,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

REPLAY_DIR = BACKEND_DIR / "replays"
EVAL_REPORT_DIR = BACKEND_DIR / "eval" / "reports"
FINISHED = {RunStatus.DONE, RunStatus.APPROVED, RunStatus.REJECTED}
RERUNNABLE = {RunStatus.DONE, RunStatus.REJECTED, RunStatus.FAILED}
EDITABLE = {RunStatus.DONE, RunStatus.REJECTED}

settings = get_settings()
logger = logging.getLogger("scopeai.api")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    repo = app.dependency_overrides.get(get_repo, get_repo)()
    if count := repo.reset_running():
        logger.info("Reset %d run(s) left in 'running' after a restart", count)
    yield


app = FastAPI(title="ScopeAI", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache
def get_repo() -> RunRepo:
    path = Path(settings.db_path)
    return RunRepo(path if path.is_absolute() else BACKEND_DIR / path)


def get_llm_client() -> LLMClient:
    return get_llm(settings)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Any, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    return JSONResponse(
        status_code=422,
        content={"detail": f"Dữ liệu không hợp lệ ({field}): {first.get('msg', '')}"},
    )


class CreateRunBody(BaseModel):
    request_text: str = Field(min_length=30, max_length=20_000)
    project_name: str | None = Field(default=None, max_length=120)
    client_name: str | None = Field(default=None, max_length=120)
    due_date: date | None = None


class MetaBody(BaseModel):
    project_name: str | None = Field(default=None, max_length=120)
    client_name: str | None = Field(default=None, max_length=120)
    due_date: date | None = None
    deal_stage: DealStage | None = None


class QuotationBody(BaseModel):
    currency: Currency | None = None
    contingency_pct: float | None = Field(default=None, ge=0, le=100)
    contract_model: ContractModel | None = None
    onsite_ratio: float | None = Field(default=None, ge=0, le=100)


class BidBody(BaseModel):
    checks: dict[str, bool | None] = {}
    decision: Literal["bid", "no_bid"] | None = None
    note: str | None = Field(default=None, max_length=1000)


class PricingApprovalBody(BaseModel):
    approved: bool
    note: str | None = Field(default=None, max_length=1000)


class VersionBody(BaseModel):
    note: str | None = Field(default=None, max_length=500)
    major: bool = False
    sent: bool = False


class VersionPatchBody(BaseModel):
    sent: bool


class ActiveTemplateBody(BaseModel):
    kind: TemplateKind
    source: TemplateSource


class ClientEmailBody(BaseModel):
    sender_name: str | None = Field(default=None, max_length=120)
    regenerate: bool = False


class AnswersBody(BaseModel):
    answers: dict[str, str]


class ReviewBody(BaseModel):
    approved: bool
    note: str | None = None


class RerunBody(BaseModel):
    from_step: StepName
    feedback: str = Field(min_length=5, max_length=2_000)


class ProposalEditBody(BaseModel):
    markdown: str = Field(min_length=20, max_length=50_000)
    title: str | None = Field(default=None, max_length=300)


class TranslateBody(BaseModel):
    language: Language


def _load(repo: RunRepo, run_id: str) -> ScopingRun:
    run = repo.get(run_id)
    if run is None:
        raise HTTPException(404, "Không tìm thấy run")
    return run


def _sse(event: Event) -> dict[str, str]:
    return {"event": event["event"], "data": json.dumps(event["data"], ensure_ascii=False)}


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "llm_provider": settings.llm_provider}


@app.post("/api/runs", status_code=201)
def create_run(body: CreateRunBody, repo: RunRepo = Depends(get_repo)) -> dict[str, str]:
    if len(body.request_text.strip()) < 30:
        raise HTTPException(422, "Yêu cầu quá ngắn (tối thiểu 30 ký tự)")
    run = ScopingRun(
        id=secrets.token_hex(4),
        created_at=datetime.now(UTC),
        request_text=body.request_text,
        project_name=(body.project_name or "").strip() or None,
        client_name=(body.client_name or "").strip() or None,
        due_date=body.due_date,
    )
    repo.save(run)
    return {"run_id": run.id}


@app.get("/api/runs")
def list_runs(
    limit: int = Query(50, ge=1, le=200), repo: RunRepo = Depends(get_repo)
) -> list[RunSummary]:
    return repo.list_recent(limit)


@app.get("/api/runs/{run_id}")
def get_run(run_id: str, repo: RunRepo = Depends(get_repo)) -> ScopingRun:
    return _load(repo, run_id)


@app.get("/api/runs/{run_id}/stream")
async def stream_run(
    run_id: str,
    repo: RunRepo = Depends(get_repo),
    llm: LLMClient = Depends(get_llm_client),
) -> EventSourceResponse:
    run = _load(repo, run_id)
    if run.status == RunStatus.RUNNING:
        raise HTTPException(409, "Run đang được xử lý")

    async def events() -> AsyncIterator[dict[str, str]]:
        if run.status in FINISHED:
            yield _sse({"event": "status", "data": {"status": run.status.value}})
            return
        async for event in run_pipeline(llm, run, repo):
            yield _sse(event)

    return EventSourceResponse(events())


@app.post("/api/runs/{run_id}/answers")
def post_answers(run_id: str, body: AnswersBody, repo: RunRepo = Depends(get_repo)) -> ScopingRun:
    run = _load(repo, run_id)
    if run.status != RunStatus.WAITING_CLARIFICATION:
        raise HTTPException(409, "Run không ở trạng thái chờ làm rõ")
    answers = {k: v.strip() for k, v in body.answers.items() if v.strip()}
    if not answers:
        raise HTTPException(422, "Cần trả lời ít nhất một câu hỏi")
    run.answers.update(answers)
    run.gaps = None
    run.status = RunStatus.CREATED
    repo.save(run)
    return run


@app.post("/api/runs/{run_id}/review")
def post_review(run_id: str, body: ReviewBody, repo: RunRepo = Depends(get_repo)) -> ScopingRun:
    run = _load(repo, run_id)
    if run.status != RunStatus.DONE:
        raise HTTPException(409, "Chỉ duyệt được run đã hoàn tất")
    run.status = RunStatus.APPROVED if body.approved else RunStatus.REJECTED
    run.reviewer_note = body.note
    sync_deal_stage(run)
    repo.save(run)
    return run


@app.get("/api/runs/{run_id}/proposal.md")
def proposal_markdown(run_id: str, repo: RunRepo = Depends(get_repo)) -> PlainTextResponse:
    run = _load(repo, run_id)
    if run.proposal is None:
        raise HTTPException(409, "Run chưa có proposal")
    return PlainTextResponse(
        run.proposal.markdown,
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": content_disposition(
                export_filename(run, load_company(), "markdown", "md")
            )
        },
    )


@app.post("/api/documents/extract")
async def extract_document(file: UploadFile = File(...)) -> dict[str, Any]:
    data = await file.read()
    try:
        return extract_text(file.filename or "", data)
    except DocumentError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/runs/{run_id}/attachments")
async def upload_attachments(
    run_id: str,
    files: list[UploadFile] = File(...),
    kinds: list[str] = Form(default=[]),
    repo: RunRepo = Depends(get_repo),
) -> ScopingRun:
    """Attach customer files before the first stream; each file is parsed by code."""
    run = _load(repo, run_id)
    if run.status != RunStatus.CREATED or run.intake is not None:
        raise HTTPException(409, "Chỉ đính kèm được file trước khi bắt đầu phân tích")
    if len(run.attachments) + len(files) > MAX_ATTACHMENTS:
        raise HTTPException(422, f"Tối đa {MAX_ATTACHMENTS} file cho mỗi phiên")
    added = []
    for index, upload in enumerate(files):
        kind = kinds[index] if index < len(kinds) and kinds[index] not in ("", "auto") else None
        if kind is not None and kind not in KINDS:
            raise HTTPException(422, f"Loại file không hợp lệ: {kind}")
        att_id = f"a{len(run.attachments) + len(added) + 1}"
        try:
            added.append(
                build_attachment(att_id, upload.filename or "file", await upload.read(), kind)  # type: ignore[arg-type]
            )
        except DocumentError as exc:
            raise HTTPException(422, str(exc)) from exc
    run.attachments.extend(added)
    repo.save(run)
    return run


@app.delete("/api/runs/{run_id}/attachments/{att_id}")
def delete_attachment(run_id: str, att_id: str, repo: RunRepo = Depends(get_repo)) -> ScopingRun:
    run = _load(repo, run_id)
    if run.status != RunStatus.CREATED or run.intake is not None:
        raise HTTPException(409, "Chỉ gỡ được file trước khi bắt đầu phân tích")
    if not any(a.id == att_id for a in run.attachments):
        raise HTTPException(404, "Không tìm thấy file đính kèm")
    run.attachments = [a for a in run.attachments if a.id != att_id]
    repo.save(run)
    return run


EXPORTS = {
    "slides.pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "proposal.docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "workbook.xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "package.zip": "application/zip",
    "qa_sheet.xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


DOC_KEYS = {
    "slides.pptx": "slides",
    "proposal.docx": "proposal",
    "workbook.xlsx": "workbook",
    "package.zip": "package",
    "qa_sheet.xlsx": "qa_sheet",
    "proposal.md": "markdown",
    "architecture.mmd": "architecture",
}


def _file_name(run: ScopingRun, kit: ExportKit, name: str, lang: str | None = None) -> str:
    stem, ext = name.rsplit(".", 1)
    localized = lang if name in ("slides.pptx", "package.zip") else None
    return export_filename(run, kit.company, DOC_KEYS.get(name, stem), ext, localized)


async def _export(run: ScopingRun, name: str, lang: str | None, llm: LLMClient) -> Response:
    if name not in EXPORTS:
        raise HTTPException(404, "Không có định dạng xuất này")
    kit = ExportKit.load()
    if name == "qa_sheet.xlsx":
        if run.gaps is None or not run.gaps.questions:
            raise HTTPException(409, "Run chưa có câu hỏi làm rõ")
        content = build_qa_sheet(run, kit)
    else:
        if run.proposal is None:
            raise HTTPException(409, "Run chưa có proposal, chưa xuất được hồ sơ")
        lang = lang or "vi"
        if lang not in ("vi", "en", "ja"):
            raise HTTPException(422, "Ngôn ngữ slide phải là vi, en hoặc ja")
        tr = None
        if name in ("slides.pptx", "package.zip") and lang != "vi":
            try:
                tr = await ensure_deck_translations(run, lang, llm)
            except Exception as exc:
                raise HTTPException(502, f"Không dịch được nội dung slide: {exc}") from exc
        if name == "slides.pptx":
            content = build_slides(run, lang, tr, kit)
        elif name == "package.zip":
            names = {key: _file_name(run, kit, key, lang) for key in DOC_KEYS if key != name}
            content = build_package(run, lang, tr, kit, names)
        elif name == "proposal.docx":
            content = build_docx(run, kit)
        else:
            content = build_workbook(run, kit)
    return Response(
        content,
        media_type=EXPORTS[name],
        headers={"Content-Disposition": content_disposition(_file_name(run, kit, name, lang))},
    )


@app.get("/api/runs/{run_id}/export/{name}")
async def export_run(
    run_id: str,
    name: str,
    lang: str | None = Query(None),
    repo: RunRepo = Depends(get_repo),
    llm: LLMClient = Depends(get_llm_client),
) -> Response:
    run = _load(repo, run_id)
    response = await _export(run, name, lang, llm)
    if lang and lang != "vi" and name in ("slides.pptx", "package.zip"):
        fresh = _load(repo, run_id)  # persist the translation cache without clobbering edits
        fresh.deck_translations = run.deck_translations
        repo.save(fresh)
    return response


@app.patch("/api/runs/{run_id}/meta")
def update_meta(run_id: str, body: MetaBody, repo: RunRepo = Depends(get_repo)) -> ScopingRun:
    run = _load(repo, run_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        if type(value) is str:  # plain text fields only (DealStage is also a str subclass)
            value = value.strip() or None
        if field == "deal_stage" and value is None:
            continue
        setattr(run, field, value)
    repo.save(run)
    return run


@app.post("/api/runs/{run_id}/quotation")
def update_quotation(
    run_id: str, body: QuotationBody, repo: RunRepo = Depends(get_repo)
) -> ScopingRun:
    run = _load(repo, run_id)
    if run.wbs is None:
        raise HTTPException(409, "Run chưa có WBS nên chưa tính được báo giá")
    if run.pricing_approval and run.pricing_approval.approved:
        raise HTTPException(409, "Báo giá đã được duyệt giá; hủy duyệt giá trước khi sửa")
    current = run.quotation
    model = body.contract_model or (current.contract_model if current else None)
    keep_pct = current is not None and current.contract_model == model
    quotation = compute_quotation(
        run,
        load_rate_card(),
        currency=body.currency or (current.currency if current else None),
        contingency_pct=(
            body.contingency_pct
            if body.contingency_pct is not None
            else (current.contingency_pct if keep_pct else None)
        ),
        contract_model=model,
        onsite_ratio=(
            body.onsite_ratio
            if body.onsite_ratio is not None
            else (current.onsite_ratio if current else None)
        ),
    )
    if quotation is None:
        raise HTTPException(409, "Không tính được báo giá cho hướng giải pháp này")
    run.quotation = quotation
    run.pricing_approval = None  # a changed price needs a new sign-off
    sync_deal_stage(run)
    repo.save(run)
    return run


@app.post("/api/runs/{run_id}/pricing-approval")
def pricing_approval(
    run_id: str, body: PricingApprovalBody, repo: RunRepo = Depends(get_repo)
) -> ScopingRun:
    """Second approval level (delivery manager / pricing) after the AI dev's technical review."""
    run = _load(repo, run_id)
    if run.quotation is None:
        raise HTTPException(409, "Run chưa có báo giá để duyệt")
    if run.status not in FINISHED:
        raise HTTPException(409, "Chỉ duyệt giá khi phân tích đã hoàn tất")
    if not body.approved and not (body.note or "").strip():
        raise HTTPException(422, "Cần ghi lý do khi yêu cầu sửa giá")
    run.pricing_approval = PricingApproval(
        approved=body.approved, note=(body.note or "").strip() or None, at=datetime.now(UTC)
    )
    sync_deal_stage(run)
    repo.save(run)
    return run


@app.get("/api/runs/{run_id}/bid")
def get_bid(run_id: str, repo: RunRepo = Depends(get_repo)) -> dict[str, Any]:
    return evaluate_bid(_load(repo, run_id), load_bid_criteria())


@app.put("/api/runs/{run_id}/bid")
def put_bid(run_id: str, body: BidBody, repo: RunRepo = Depends(get_repo)) -> dict[str, Any]:
    run = _load(repo, run_id)
    criteria = load_bid_criteria()
    known = {c.id for c in criteria}
    if unknown := set(body.checks) - known:
        raise HTTPException(422, f"Tiêu chí không tồn tại: {sorted(unknown)}")
    previous = run.bid.decision if run.bid else None
    run.bid = BidDecision(
        checks=body.checks,
        decision=body.decision,
        note=(body.note or "").strip() or None,
        decided_at=datetime.now(UTC) if body.decision else None,
    )
    if body.decision == "no_bid":
        run.deal_stage = DealStage.NO_BID
    elif previous == "no_bid" and run.deal_stage == DealStage.NO_BID:
        run.deal_stage = DealStage.NEW  # back in the pipeline: follow the analysis status again
        sync_deal_stage(run)
    repo.save(run)
    return evaluate_bid(run, criteria)


def _next_version(run: ScopingRun, major: bool) -> str:
    if not run.versions:
        return "1.0"
    high, low = (int(x) for x in run.versions[-1].version.split("."))
    return f"{high + 1}.0" if major else f"{high}.{low + 1}"


@app.post("/api/runs/{run_id}/versions")
def create_version(run_id: str, body: VersionBody, repo: RunRepo = Depends(get_repo)) -> ScopingRun:
    """Freeze what goes to the customer as 1.0, 1.1, 2.0 ... (also used in file names)."""
    run = _load(repo, run_id)
    if run.proposal is None:
        raise HTTPException(409, "Run chưa có proposal để chốt phiên bản")
    now = datetime.now(UTC)
    run.versions.append(
        ProposalVersion(
            version=_next_version(run, body.major),
            created_at=now,
            note=(body.note or "").strip() or None,
            sent=body.sent,
            sent_at=now if body.sent else None,
            markdown=run.proposal.markdown,
            proposal_title=run.proposal.title,
            total=run.quotation.total if run.quotation else None,
            currency=run.quotation.currency if run.quotation else None,
            pattern=run.pattern.pattern.value if run.pattern else None,
        )
    )
    if body.sent and run.deal_stage not in MANUAL:
        run.deal_stage = DealStage.SENT
    repo.save(run)
    return run


@app.patch("/api/runs/{run_id}/versions/{version}")
def update_version(
    run_id: str, version: str, body: VersionPatchBody, repo: RunRepo = Depends(get_repo)
) -> ScopingRun:
    run = _load(repo, run_id)
    target = next((v for v in run.versions if v.version == version), None)
    if target is None:
        raise HTTPException(404, "Không tìm thấy phiên bản")
    target.sent = body.sent
    target.sent_at = datetime.now(UTC) if body.sent else None
    if body.sent and run.deal_stage not in MANUAL:
        run.deal_stage = DealStage.SENT
    repo.save(run)
    return run


@app.get("/api/runs/{run_id}/case-studies")
def run_case_studies(run_id: str, repo: RunRepo = Depends(get_repo)) -> list[dict[str, Any]]:
    run = _load(repo, run_id)
    return [
        {**m["case"].model_dump(), "score": m["score"], "reasons": m["reasons"]}
        for m in match_case_studies(run, load_case_studies())
    ]


def _render_email(email: ClientEmail, run: ScopingRun, sender: str | None) -> dict[str, str]:
    client = run.client_name or {"ja": "ご担当者様", "en": "Sir/Madam"}.get(
        run.intake.language if run.intake else "vi", "Quý khách"
    )
    fill = lambda text: text.replace("{{client_name}}", client).replace(  # noqa: E731
        "{{sender_name}}", sender or "[Tên người gửi]"
    )
    return {"subject": fill(email.subject), "body": fill(email.body)}


@app.post("/api/runs/{run_id}/client-email")
async def client_email(
    run_id: str,
    body: ClientEmailBody,
    repo: RunRepo = Depends(get_repo),
    llm: LLMClient = Depends(get_llm_client),
) -> dict[str, str]:
    """Draft email with the clarifying questions. Names are filled in by code, never by the LLM."""
    run = _load(repo, run_id)
    if run.gaps is None or not run.gaps.questions:
        raise HTTPException(409, "Run chưa có câu hỏi làm rõ")
    if run.client_email is None or body.regenerate:
        context = {
            "language": run.intake.language if run.intake else "vi",
            "intake": {"business_goal": run.intake.business_goal if run.intake else ""},
            "questions": [
                {"id": q.id, "question": q.question, "blocking": q.blocking}
                for q in run.gaps.questions
            ],
        }
        try:
            email, _ = await CLIENT_EMAIL.run(llm, context)
        except StepError as exc:
            raise HTTPException(502, f"Không soạn được email: {exc.message}") from exc
        except Exception as exc:
            raise HTTPException(502, f"Không soạn được email: {exc}") from exc
        run = _load(repo, run_id)
        run.client_email = email
        repo.save(run)
    return _render_email(run.client_email, run, body.sender_name)  # type: ignore[arg-type]


@app.post("/api/runs/{run_id}/answers/import")
async def import_answers(
    run_id: str, file: UploadFile = File(...), repo: RunRepo = Depends(get_repo)
) -> ScopingRun:
    run = _load(repo, run_id)
    if run.status != RunStatus.WAITING_CLARIFICATION or run.gaps is None:
        raise HTTPException(409, "Run không ở trạng thái chờ làm rõ")
    try:
        parsed = parse_qa_answers(await file.read(), load_templates_config().qa_sheet)
    except DocumentError as exc:
        raise HTTPException(422, str(exc)) from exc
    known = {q.id for q in run.gaps.questions}
    answers = {k: v for k, v in parsed.items() if k in known}
    if not answers:
        raise HTTPException(422, "File chưa có câu trả lời nào cho các câu hỏi của phiên này")
    return post_answers(run_id, AnswersBody(answers=answers), repo)


@app.get("/api/runs/{run_id}/similar")
def similar_runs(run_id: str, repo: RunRepo = Depends(get_repo)) -> list[dict[str, Any]]:
    run = _load(repo, run_id)
    return [
        {
            **RunSummary.from_run(other).model_dump(mode="json"),
            "score": score,
        }
        for other, score in find_similar(run, repo.all_runs())
    ]


@app.get("/api/stats")
def stats(repo: RunRepo = Depends(get_repo)) -> dict[str, Any]:
    runs = repo.all_runs()
    impact = load_rate_card().impact
    finished = [r for r in runs if r.proposal is not None]
    hours = sum(
        max(
            0.0,
            impact.manual_hours_per_proposal
            - impact.review_hours_per_proposal
            - sum(r.step_latency_ms.values()) / 3_600_000,
        )
        for r in finished
    )
    stages = {stage.value: sum(1 for r in runs if r.deal_stage == stage) for stage in DealStage}
    decided = stages["won"] + stages["lost"]
    return {
        "runs": len(runs),
        "finished": len(finished),
        "stages": stages,
        "win_rate": stages["won"] / decided if decided else None,
        "hours_saved": round(hours, 1),
        "manual_hours_per_proposal": impact.manual_hours_per_proposal,
        "review_hours_per_proposal": impact.review_hours_per_proposal,
    }


@app.get("/api/settings")
def get_settings_payload() -> dict[str, Any]:
    return read_settings()


def _settings_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ValidationError):
        first = exc.errors()[0]
        where = ".".join(str(p) for p in first.get("loc", []))
        return HTTPException(422, f"Dữ liệu không hợp lệ ({where}): {first.get('msg', '')}")
    return HTTPException(422, str(exc))


@app.put("/api/settings/rate-card")
def put_rate_card(body: dict[str, Any]) -> dict[str, Any]:
    try:
        return save_rate_card(body).model_dump()
    except (ValidationError, ValueError) as exc:
        raise _settings_error(exc) from exc


@app.put("/api/settings/estimation-template")
def put_estimation_template(body: dict[str, Any]) -> dict[str, Any]:
    try:
        return save_estimation_template(body).model_dump(mode="json")
    except (ValidationError, ValueError) as exc:
        raise _settings_error(exc) from exc


@app.put("/api/settings/company")
def put_company(body: dict[str, Any]) -> dict[str, Any]:
    try:
        return save_company(body).model_dump()
    except (ValidationError, ValueError) as exc:
        raise _settings_error(exc) from exc


@app.put("/api/settings/content-library")
def put_content_library(body: list[dict[str, Any]]) -> list[dict[str, Any]]:
    try:
        return [b.model_dump() for b in save_content_library(body)]
    except (ValidationError, ValueError) as exc:
        raise _settings_error(exc) from exc


@app.put("/api/settings/case-studies")
def put_case_studies(body: list[dict[str, Any]]) -> list[dict[str, Any]]:
    try:
        return [c.model_dump() for c in save_case_studies(body)]
    except (ValidationError, ValueError) as exc:
        raise _settings_error(exc) from exc


@app.put("/api/settings/bid-criteria")
def put_bid_criteria(body: list[dict[str, Any]]) -> list[dict[str, Any]]:
    try:
        return [c.model_dump() for c in save_bid_criteria(body)]
    except (ValidationError, ValueError) as exc:
        raise _settings_error(exc) from exc


# ---------- company templates ----------
@app.get("/api/templates")
def get_templates() -> dict[str, Any]:
    return list_templates()


@app.get("/api/templates/{kind}/{source}/file")
def download_template(kind: str, source: str) -> Response:
    if kind not in TEMPLATE_FILES or source not in ("sample", "custom"):
        raise HTTPException(404, "Không có template này")
    path = resolve(kind, source)
    if path is None:
        raise HTTPException(404, "Chưa có template này")
    media = {"slides": "slides.pptx", "proposal_docx": "proposal.docx"}.get(kind, "workbook.xlsx")
    return Response(
        path.read_bytes(),
        media_type=EXPORTS[media],
        headers={
            "Content-Disposition": content_disposition(f"template_{source}_{TEMPLATE_FILES[kind]}")
        },
    )


@app.post("/api/templates/{kind}")
async def upload_template(kind: str, file: UploadFile = File(...)) -> dict[str, Any]:
    if kind not in TEMPLATE_FILES:
        raise HTTPException(404, "Loại template không hợp lệ")
    try:
        warnings = save_custom(kind, file.filename or "", await file.read())
    except TemplateError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"warnings": warnings, **list_templates()}


@app.delete("/api/templates/{kind}/custom")
def remove_template(kind: str) -> dict[str, Any]:
    if not delete_custom(kind):
        raise HTTPException(404, "Chưa có template riêng để xóa")
    return list_templates()


@app.put("/api/templates/active")
def put_active_template(body: ActiveTemplateBody) -> dict[str, Any]:
    try:
        set_active(body.kind, body.source)
    except TemplateError as exc:
        raise HTTPException(409, str(exc)) from exc
    return list_templates()


@app.put("/api/templates/config")
def put_template_config(body: dict[str, Any]) -> dict[str, Any]:
    """Layout name and Excel column mappings (the active sources are kept as they are)."""
    try:
        cfg = TemplatesConfig.model_validate({**body, "active": load_templates_config().active})
    except ValidationError as exc:
        raise _settings_error(exc) from exc
    save_templates_config(cfg)
    return list_templates()


class ReferenceBody(BaseModel):
    content: str


@app.put("/api/settings/reference-projects/{name}")
def put_reference_project(name: str, body: ReferenceBody) -> dict[str, str]:
    try:
        save_reference_project(name, body.content)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"name": name}


@app.delete("/api/settings/reference-projects/{name}")
def remove_reference_project(name: str) -> dict[str, str]:
    if not delete_reference_project(name):
        raise HTTPException(404, "Không tìm thấy dự án tham chiếu")
    return {"name": name}


@app.post("/api/runs/{run_id}/rerun")
def rerun(run_id: str, body: RerunBody, repo: RunRepo = Depends(get_repo)) -> ScopingRun:
    run = _load(repo, run_id)
    if run.status not in RERUNNABLE:
        raise HTTPException(409, "Chỉ chạy lại được run đã hoàn tất, bị yêu cầu sửa hoặc bị lỗi")
    reset_from(run, body.from_step)
    run.feedback = body.feedback.strip()
    run.feedback_step = body.from_step
    run.revision += 1
    run.pricing_approval = None
    run.status = RunStatus.CREATED
    run.error = None
    repo.save(run)
    return run


@app.put("/api/runs/{run_id}/proposal")
def edit_proposal(
    run_id: str, body: ProposalEditBody, repo: RunRepo = Depends(get_repo)
) -> ScopingRun:
    run = _load(repo, run_id)
    if run.proposal is None:
        raise HTTPException(409, "Run chưa có proposal")
    if run.status not in EDITABLE:
        raise HTTPException(409, "Chỉ sửa được proposal khi chưa duyệt")
    run.proposal.markdown = body.markdown
    if body.title and body.title.strip():
        run.proposal.title = body.title.strip()
    run.proposal_edited = True
    run.translations = {}
    repo.save(run)
    return run


@app.post("/api/runs/{run_id}/proposal/translate")
async def translate_proposal(
    run_id: str,
    body: TranslateBody,
    repo: RunRepo = Depends(get_repo),
    llm: LLMClient = Depends(get_llm_client),
) -> dict[str, str]:
    run = _load(repo, run_id)
    if run.proposal is None:
        raise HTTPException(409, "Run chưa có proposal")
    if body.language == run.proposal.language:
        return {"language": body.language, "markdown": run.proposal.markdown}
    if body.language not in run.translations:
        context = {"target_language": body.language, "markdown": run.proposal.markdown}
        try:
            result, _ = await TRANSLATE.run(llm, context)
        except StepError as exc:
            raise HTTPException(502, f"Không dịch được proposal: {exc.message}") from exc
        except Exception as exc:
            raise HTTPException(502, f"Không dịch được proposal: {exc}") from exc
        run = _load(repo, run_id)  # reload: the run may have changed while translating
        run.translations[body.language] = result.markdown
        repo.save(run)
    return {"language": body.language, "markdown": run.translations[body.language]}


def _eval_report_path(name: str) -> Path:
    path = EVAL_REPORT_DIR / f"{name}.json"
    if not name.replace("_", "").isalnum() or not path.exists():
        raise HTTPException(404, "Không tìm thấy report")
    return path


@app.get("/api/eval/reports")
def list_eval_reports() -> list[dict[str, Any]]:
    reports = []
    for path in sorted(EVAL_REPORT_DIR.glob("eval_*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        reports.append(
            {
                "name": path.stem,
                "provider": data.get("provider"),
                "label": data.get("label"),
                "created_at": data.get("created_at"),
                "summary": data.get("summary", {}),
            }
        )
    return reports


@app.get("/api/eval/reports/{name}")
def get_eval_report(name: str) -> dict[str, Any]:
    data = json.loads(_eval_report_path(name).read_text(encoding="utf-8"))
    for case in data.get("cases", []):
        case.pop("outputs", None)
    return {"name": name, **data}


def _load_replay(name: str) -> dict[str, Any]:
    path = REPLAY_DIR / f"{name}.json"
    if not name.replace("_", "").replace("-", "").isalnum() or not path.exists():
        raise HTTPException(404, "Không tìm thấy bản replay")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/replays")
def list_replays() -> list[str]:
    return sorted(p.stem for p in REPLAY_DIR.glob("*.json"))


@app.get("/api/replays/{name}")
def get_replay(name: str) -> dict[str, Any]:
    """Replay metadata: request text and the answers used before each segment."""
    recording = _load_replay(name)
    return {
        "name": recording["name"],
        "llm_provider": recording.get("llm_provider"),
        "recorded_at": recording.get("recorded_at"),
        "request_text": recording.get("request_text", ""),
        "segments": [{"answers": seg.get("answers", {})} for seg in recording["segments"]],
        "attachments": recording.get("attachments", []),
        "has_final_run": bool(recording.get("final_run")),
    }


@app.get("/api/replays/{name}/export/{file}")
async def export_replay(
    name: str,
    file: str,
    lang: str | None = Query(None),
    llm: LLMClient = Depends(get_llm_client),
) -> Response:
    """Offline demo: build the deliverables from the run snapshot stored in the replay."""
    recording = _load_replay(name)
    if not recording.get("final_run"):
        raise HTTPException(409, "Bản replay này không lưu kết quả cuối, hãy ghi lại")
    run = ScopingRun.model_validate(recording["final_run"])
    return await _export(run, file, lang, llm)


@app.get("/api/replays/{name}/stream")
async def stream_replay(
    name: str,
    segment: int = Query(0, ge=0),
    speed: float = Query(1.0, gt=0, le=20),
) -> EventSourceResponse:
    recording = _load_replay(name)
    if segment >= len(recording["segments"]):
        raise HTTPException(404, "Không tìm thấy đoạn replay")
    recorded = recording["segments"][segment]["events"]

    async def events() -> AsyncIterator[dict[str, str]]:
        for item in recorded:
            await asyncio.sleep(item.get("delay_ms", 0) / 1000 / speed)
            yield _sse(item)

    return EventSourceResponse(events())
