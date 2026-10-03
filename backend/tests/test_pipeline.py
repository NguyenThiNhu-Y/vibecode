from app.agents.pipeline import reset_from, run_pipeline
from app.llm.mock import FIXTURE_DIR, MockLLM
from app.schemas.common import STEP_NAMES
from app.schemas.run import RunStatus
from tests.conftest import MemoryRepo, make_run

BLOCKING_GAPS = (FIXTURE_DIR / "scenarios" / "clarify" / "gaps.json").read_text(encoding="utf-8")


async def collect(llm, run, repo) -> list[dict]:
    return [event async for event in run_pipeline(llm, run, repo)]


def names(events: list[dict]) -> list[str]:
    return [e["event"] for e in events]


async def test_full_run_reaches_done_with_ordered_events(memory_repo: MemoryRepo) -> None:
    run = make_run()
    events = await collect(MockLLM(), run, memory_repo)

    expected = ["status"] + ["step_started", "step_done"] * 8 + ["status"]
    assert names(events) == expected
    assert events[0]["data"] == {"status": "running"}
    assert events[-1]["data"] == {"status": "done"}
    done_steps = [e["data"]["step"] for e in events if e["event"] == "step_done"]
    assert done_steps == list(STEP_NAMES)
    assert all(
        isinstance(e["data"]["latency_ms"], int) for e in events if e["event"] == "step_done"
    )

    stored = memory_repo.get(run.id)
    assert stored is not None and stored.status == RunStatus.DONE
    assert stored.proposal is not None
    assert set(stored.step_latency_ms) == set(STEP_NAMES)


async def test_blocking_gaps_stop_at_waiting_clarification(memory_repo: MemoryRepo) -> None:
    run = make_run()
    llm = MockLLM({"gaps": [BLOCKING_GAPS]})
    events = await collect(llm, run, memory_repo)

    assert events[-1] == {"event": "status", "data": {"status": "waiting_clarification"}}
    assert llm.calls == ["intake", "gaps"]
    stored = memory_repo.get(run.id)
    assert stored is not None
    assert stored.status == RunStatus.WAITING_CLARIFICATION
    assert stored.pattern is None


async def test_resume_with_answers_skips_intake(memory_repo: MemoryRepo) -> None:
    run = make_run()
    await collect(MockLLM({"gaps": [BLOCKING_GAPS]}), run, memory_repo)

    run.answers = {"q1": "Bộ phận chăm sóc khách hàng", "q2": "Email và tài liệu FAQ"}
    run.gaps = None
    run.status = RunStatus.CREATED
    llm = MockLLM()
    events = await collect(llm, run, memory_repo)

    assert "intake" not in llm.calls
    assert llm.calls == ["gaps", "pattern", "feasibility", "architecture", "wbs", "proposal"]
    assert events[-1]["data"] == {"status": "done"}
    started = [e["data"]["step"] for e in events if e["event"] == "step_started"]
    assert "intake" not in started


async def test_still_blocking_after_answers_proceeds_with_assumptions(
    memory_repo: MemoryRepo,
) -> None:
    run = make_run()
    run.answers = {"q1": "Chưa rõ"}
    events = await collect(MockLLM({"gaps": [BLOCKING_GAPS]}), run, memory_repo)

    assert events[-1]["data"] == {"status": "done"}
    assert run.pattern is not None
    assert any(a.startswith("Chưa được làm rõ:") for a in run.pattern.assumptions)


async def test_failing_step_emits_run_error(memory_repo: MemoryRepo) -> None:
    run = make_run()
    llm = MockLLM({"feasibility": ["không phải JSON"]})
    events = await collect(llm, run, memory_repo)

    assert events[-1]["event"] == "run_error"
    assert events[-1]["data"]["step"] == "feasibility"
    assert llm.calls.count("feasibility") == 3  # 1 + max_retries
    assert "architecture" not in llm.calls
    stored = memory_repo.get(run.id)
    assert stored is not None
    assert stored.status == RunStatus.FAILED
    assert stored.error and stored.error.startswith("feasibility")


async def test_disconnect_mid_run_leaves_run_resumable(memory_repo: MemoryRepo) -> None:
    run = make_run()
    gen = run_pipeline(MockLLM(), run, memory_repo)
    async for event in gen:
        if event["event"] == "step_done":
            break
    await gen.aclose()

    stored = memory_repo.get(run.id)
    assert stored is not None
    assert stored.status == RunStatus.CREATED
    assert stored.intake is not None


class RecordingLLM(MockLLM):
    def __init__(self, responses=None):
        super().__init__(responses)
        self.users: dict[str, list[str]] = {}

    async def complete(self, system: str, user: str, *, tag: str | None = None) -> str:
        self.users.setdefault(tag or "?", []).append(user)
        return await super().complete(system, user, tag=tag)


async def test_architecture_event_carries_effort_basis(memory_repo: MemoryRepo) -> None:
    run = make_run()
    events = await collect(MockLLM(), run, memory_repo)
    arch = next(
        e for e in events if e["event"] == "step_done" and e["data"]["step"] == "architecture"
    )
    basis = arch["data"]["effort_basis"]
    assert basis["pattern"] == "rag" and basis["computed"]["mvp"] == [30, 50]
    assert run.effort_basis is not None


async def test_pii_is_masked_before_reaching_llm(memory_repo: MemoryRepo) -> None:
    run = make_run("Liên hệ chị Lan qua lan@example.vn hoặc 0912 345 678 để trao đổi RFP.")
    llm = RecordingLLM()
    await collect(llm, run, memory_repo)
    sent = " ".join(llm.users["intake"] + llm.users["gaps"])
    assert "lan@example.vn" not in sent and "0912 345 678" not in sent
    assert "[EMAIL_1]" in sent and "[PHONE_1]" in sent
    assert run.redactions == {"email": 1, "phone": 1}
    assert run.request_text.startswith("Liên hệ chị Lan qua lan@example.vn")


async def test_reviewer_feedback_reaches_rerun_steps_only(memory_repo: MemoryRepo) -> None:
    run = make_run()
    await collect(MockLLM(), run, memory_repo)
    reset_from(run, "feasibility")
    run.feedback = "Bổ sung rủi ro về chi phí vận hành"
    run.feedback_step = "feasibility"
    llm = RecordingLLM()
    events = await collect(llm, run, memory_repo)

    assert llm.calls == ["feasibility", "architecture", "wbs", "proposal"]
    assert all("reviewer_feedback" in u for tag in llm.calls for u in llm.users[tag])
    assert events[-1]["data"] == {"status": "done"}


async def test_attachments_feed_contexts_and_requirements_step(memory_repo: MemoryRepo) -> None:
    from app.ingest import build_attachment
    from tests.samples import data_csv, docx_file, requirements_xlsx

    run = make_run()
    run.attachments = [
        build_attachment("a1", "req.xlsx", requirements_xlsx(45)),
        build_attachment("a2", "data.csv", data_csv()),
        build_attachment("a3", "doc.docx", docx_file("Gọi 0912 345 678 để hỏi.")),
    ]
    llm = RecordingLLM()
    events = await collect(llm, run, memory_repo)

    assert events[-1]["data"] == {"status": "done"}
    assert llm.calls.count("requirements") == 2  # 45 requirements -> batches of 40 + 5
    assert run.requirements is not None and len(run.requirements.items) == 45
    assert '"attachments"' in llm.users["intake"][0] and '"documents"' in llm.users["intake"][0]
    assert (
        '"documents"' not in llm.users["pattern"][0] and '"data_samples"' in llm.users["pattern"][0]
    )
    assert "0912 345 678" not in " ".join(llm.users["intake"])
    assert run.redactions.get("phone") == 1
    assert run.schedule is not None and run.schedule.total_days > 0
    wbs_event = next(e for e in events if e["event"] == "step_done" and e["data"]["step"] == "wbs")
    assert wbs_event["data"]["schedule"]["total_days"] == run.schedule.total_days


async def test_requirements_skipped_without_file(memory_repo: MemoryRepo) -> None:
    run = make_run()
    llm = MockLLM()
    await collect(llm, run, memory_repo)
    assert "requirements" not in llm.calls
    assert run.requirements is not None and run.requirements.skipped
