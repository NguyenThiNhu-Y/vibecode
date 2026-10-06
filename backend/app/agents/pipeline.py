import time
from collections.abc import AsyncIterator
from typing import Any, Protocol

from app.agents.estimate import explain_estimates
from app.agents.pricing import compute_quotation, load_rate_card
from app.agents.schedule import ScheduleError, build_schedule, config_for
from app.agents.step import Step, StepError
from app.agents.steps import (
    FEASIBILITY,
    GAPS,
    INTAKE,
    PATTERN,
    PROPOSAL,
    architecture_step,
    requirements_step,
    wbs_step,
)
from app.company import load_case_studies, match_case_studies
from app.config import get_settings
from app.deal import sync_deal_stage
from app.ingest.digest import all_requirements, attachments_digest
from app.llm.base import LLMClient
from app.privacy import mask_pii
from app.schemas.common import STEP_NAMES, Phase
from app.schemas.effort import EffortBasis
from app.schemas.requirements import RequirementMatrix
from app.schemas.run import RunStatus, ScopingRun

Event = dict[str, Any]  # {"event": <SSE event name>, "data": <JSON-able dict>}
REQUIREMENT_BATCH = 40


class RunRepo(Protocol):
    def save(self, run: ScopingRun) -> None: ...


def _event(name: str, data: dict[str, Any]) -> Event:
    return {"event": name, "data": data}


def _dump(model: Any) -> Any:
    return model.model_dump(mode="json") if model is not None else None


class _Masker:
    """Masks user-written text (request, answers, feedback) when PII masking is enabled."""

    def __init__(self, enabled: bool):
        self.enabled = enabled

    def text(self, value: str) -> str:
        return mask_pii(value)[0] if self.enabled else value

    def answers(self, answers: dict[str, str]) -> dict[str, str]:
        return {k: self.text(v) for k, v in answers.items()}


def _digest(run: ScopingRun, mask: _Masker, documents: bool) -> dict[str, Any]:
    digest = attachments_digest(run.attachments, mask.text)
    if not documents:
        digest.pop("documents", None)
    return digest


def _wbs_summary(run: ScopingRun) -> dict[str, Any] | None:
    """Totals per phase x type only (BIDDING_SPEC 2.3: never the full tree, to save tokens)."""
    if run.wbs is None:
        return None
    return {
        t.phase.value: {
            "tasks": sum(1 for i in run.wbs.items if i.phase == t.phase and i.level == 2),
            "man_days": t.total_md,
            "by_type": {k.value: v for k, v in t.by_type.items()},
        }
        for t in run.wbs.totals
    }


def _timeline(run: ScopingRun) -> dict[str, Any] | None:
    if run.schedule is None:
        return None
    return {
        "phases": [
            {"phase": p.phase.value, "start": p.start.isoformat(), "end": p.end.isoformat(),
             "working_days": p.working_days}
            for p in run.schedule.phases
        ],
        "milestones": [
            {"id": m.id, "name": m.name, "date": m.date.isoformat()}
            for m in run.schedule.milestones
        ],
        "working_days": sum(p.working_days for p in run.schedule.phases),
    }  # fmt: skip


def _requirements_summary(run: ScopingRun) -> dict[str, Any] | None:
    if run.requirements is None or run.requirements.skipped:
        return None
    counts: dict[str, int] = {}
    for item in run.requirements.items:
        counts[item.coverage] = counts.get(item.coverage, 0) + 1
    texts = {r.id: r.text for r in all_requirements(run.attachments)}
    return {
        "counts": counts,
        "not_supported": [
            f"{i.req_id}: {texts.get(i.req_id, '')[:120]}"
            for i in run.requirements.items
            if i.coverage == "not_supported"
        ][:15],
        "needs_clarification": [
            f"{i.req_id}: {texts.get(i.req_id, '')[:120]}"
            for i in run.requirements.items
            if i.coverage == "needs_clarification"
        ][:15],
    }


def _context(
    name: str, run: ScopingRun, basis: EffortBasis | None, mask: _Masker
) -> dict[str, Any]:
    answers = mask.answers(run.answers)
    if name == "intake":
        ctx: dict[str, Any] = {"request_text": mask.text(run.request_text)}
    elif name == "gaps":
        ctx = {
            "request_text": mask.text(run.request_text),
            "intake": _dump(run.intake),
            "answers": answers,
        }
    elif name == "pattern":
        ctx = {"intake": _dump(run.intake), "gaps": _dump(run.gaps), "answers": answers}
    elif name == "feasibility":
        ctx = {"intake": _dump(run.intake), "pattern": _dump(run.pattern), "answers": answers}
    elif name == "architecture":
        computed = basis.computed if basis else {}
        ctx = {
            "intake": _dump(run.intake),
            "pattern": _dump(run.pattern),
            "feasibility": _dump(run.feasibility),
            "computed_estimates": {phase.value: rng for phase, rng in computed.items()},
        }
    elif name == "wbs":
        computed = run.effort_basis.computed if run.effort_basis else {}
        ctx = {
            "intake": _dump(run.intake),
            "pattern": _dump(run.pattern),
            "feasibility": {"risks": _dump(run.feasibility)["risks"]} if run.feasibility else None,
            "architecture": _dump(run.architecture),
            "computed_estimates": {phase.value: rng for phase, rng in computed.items()},
            "answers": answers,
        }
    elif name == "requirements":
        ctx = {
            "pattern": _dump(run.pattern),
            "architecture": {
                "components": _dump(run.architecture)["components"] if run.architecture else [],
                "deployment": run.architecture.deployment.value if run.architecture else None,
            },
        }
    else:
        ctx = {
            "intake": _dump(run.intake),
            "gaps": _dump(run.gaps),
            "answers": answers,
            "pattern": _dump(run.pattern),
            "feasibility": _dump(run.feasibility),
            "architecture": _dump(run.architecture),
            "wbs_summary": _wbs_summary(run),
            "timeline": _timeline(run),
            "requirements_summary": _requirements_summary(run),
            "quotation_summary": (
                {
                    "currency": run.quotation.currency,
                    "contract_model": run.quotation.contract_model,
                    "total": run.quotation.total,
                    "range": [run.quotation.total_min, run.quotation.total_max],
                    "contingency_pct": run.quotation.contingency_pct,
                    "monthly_run_cost": run.quotation.monthly_run_cost,
                }
                if run.quotation
                else None
            ),
            # Public, simulated company references from the KB (no customer data)
            "case_studies": [
                {
                    "title": m["case"].title,
                    "industry": m["case"].industry,
                    "results": m["case"].results,
                }
                for m in match_case_studies(run, load_case_studies())[:2]
            ],
        }
    if run.attachments and name in {"intake", "gaps", "pattern", "feasibility", "architecture"}:
        ctx["attachments"] = _digest(run, mask, documents=name in {"intake", "gaps"})
    if (
        run.feedback
        and run.feedback_step
        and STEP_NAMES.index(name) >= STEP_NAMES.index(run.feedback_step)
    ):
        ctx["reviewer_feedback"] = mask.text(run.feedback)
    return ctx


async def _run_requirements(
    llm: LLMClient, run: ScopingRun, mask: _Masker
) -> tuple[RequirementMatrix, int]:
    """Assess every requirement row in batches; no requirement file -> skipped, no LLM call."""
    requirements = all_requirements(run.attachments)
    if not requirements:
        return RequirementMatrix(items=[], skipped=True), 0
    started = time.perf_counter()
    items = []
    for i in range(0, len(requirements), REQUIREMENT_BATCH):
        batch = requirements[i : i + REQUIREMENT_BATCH]
        ctx = _context("requirements", run, None, mask)
        ctx["requirements"] = [
            {"id": r.id, "text": mask.text(r.text), "priority": r.priority, "category": r.category}
            for r in batch
        ]
        result, _ = await requirements_step([r.id for r in batch]).run(llm, ctx)
        items.extend(result.items)
    return RequirementMatrix(items=items), int((time.perf_counter() - started) * 1000)


def _count_redactions(run: ScopingRun) -> dict[str, int]:
    """PII masked across the request and every attachment text that reaches the LLM."""
    texts = [run.request_text]
    for att in run.attachments:
        texts.append(att.text or "")
        texts.extend(r.text for r in att.requirements)
    counts: dict[str, int] = {}
    for text in texts:
        for kind, n in mask_pii(text)[1].items():
            counts[kind] = counts.get(kind, 0) + n
    return counts


def _note_unresolved(run: ScopingRun) -> None:
    """When proceeding despite blocking questions, record them as explicit assumptions."""
    if run.pattern is None or run.gaps is None:
        return
    for question in run.gaps.questions:
        if question.blocking:
            note = f"Chưa được làm rõ: {question.question}"
            if note not in run.pattern.assumptions:
                run.pattern.assumptions.append(note)


def _computed(basis: EffortBasis | None) -> dict[Phase, tuple[int, int]]:
    if basis is None:
        return {}
    return {phase: (low, high) for phase, (low, high) in basis.computed.items()}


_FIXED_STEPS: dict[str, Step] = {
    "intake": INTAKE,
    "gaps": GAPS,
    "pattern": PATTERN,
    "feasibility": FEASIBILITY,
    "proposal": PROPOSAL,
}


async def run_pipeline(llm: LLMClient, run: ScopingRun, repo: RunRepo) -> AsyncIterator[Event]:
    """Run the remaining steps of `run`, yielding SSE events (AGENTS.md 4.3 / 5.3)."""
    mask = _Masker(get_settings().pii_masking)
    run.redactions = _count_redactions(run) if mask.enabled else {}
    run.status = RunStatus.RUNNING
    run.error = None
    repo.save(run)
    yield _event("status", {"status": run.status.value})
    try:
        for name in STEP_NAMES:
            if getattr(run, name) is None:
                basis: EffortBasis | None = None
                step: Step | None = None
                if name == "architecture":
                    assert run.pattern and run.intake and run.feasibility
                    basis = explain_estimates(
                        run.pattern,
                        run.intake,
                        run.feasibility,
                        requirement_count=len(all_requirements(run.attachments)),
                    )
                    run.effort_basis = basis
                    step = architecture_step(_computed(basis))
                elif name == "wbs":
                    assert run.architecture and run.pattern
                    step = wbs_step(
                        run.pattern.pattern,
                        _computed(run.effort_basis),
                        [e.phase for e in run.architecture.estimates],
                    )
                elif name != "requirements":
                    step = _FIXED_STEPS[name]

                yield _event("step_started", {"step": name})
                try:
                    if step is None:
                        result, latency_ms = await _run_requirements(llm, run, mask)
                    else:
                        result, latency_ms = await step.run(llm, _context(name, run, basis, mask))
                    if name == "wbs":  # master schedule: code only (BIDDING_SPEC 4)
                        start = run.intake.project_start if run.intake else None
                        run.schedule_config = config_for(run.schedule_config, start, result)
                        schedule = build_schedule(result, run.schedule_config)
                except StepError as exc:
                    message = exc.message
                except ScheduleError as exc:
                    message = str(exc)
                except Exception as exc:  # network errors, provider not configured, ...
                    message = f"Lỗi hệ thống: {exc}"
                else:
                    message = None
                if message is not None:
                    run.status = RunStatus.FAILED
                    run.error = f"{name}: {message}"
                    repo.save(run)
                    yield _event("run_error", {"step": name, "message": message})
                    return

                setattr(run, name, result)
                if name == "pattern" and run.answers:
                    _note_unresolved(run)
                if name == "wbs":
                    run.schedule = schedule
                    run.quotation = compute_quotation(run, load_rate_card())
                run.step_latency_ms[name] = latency_ms
                repo.save(run)
                data: dict[str, Any] = {
                    "step": name,
                    "result": _dump(result),
                    "latency_ms": latency_ms,
                }
                if name == "architecture":
                    data["effort_basis"] = _dump(run.effort_basis)
                if name == "wbs":
                    data["schedule"] = _dump(run.schedule)
                    data["quotation"] = _dump(run.quotation)
                yield _event("step_done", data)

            if name == "gaps" and run.gaps and not run.gaps.can_proceed and not run.answers:
                run.status = RunStatus.WAITING_CLARIFICATION
                sync_deal_stage(run)
                repo.save(run)
                yield _event("status", {"status": run.status.value})
                return

        run.status = RunStatus.DONE
        sync_deal_stage(run)
        repo.save(run)
        yield _event("status", {"status": run.status.value})
    finally:
        # Client disconnected mid-run: make the run resumable instead of stuck in "running".
        if run.status == RunStatus.RUNNING:
            run.status = RunStatus.CREATED
            repo.save(run)


def reset_from(run: ScopingRun, step: str) -> None:
    """Clear `step` and every later step so the pipeline recomputes them."""
    for name in STEP_NAMES[STEP_NAMES.index(step) :]:
        setattr(run, name, None)
        run.step_latency_ms.pop(name, None)
    if STEP_NAMES.index(step) <= STEP_NAMES.index("architecture"):
        run.effort_basis = None
    if STEP_NAMES.index(step) <= STEP_NAMES.index("wbs"):
        run.schedule = None
        run.quotation = None
        run.wbs_edited = False
    run.translations = {}
    run.proposal_edited = False
