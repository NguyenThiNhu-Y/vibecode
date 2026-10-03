from app.schemas.architecture import ArchitectureResult
from app.schemas.gaps import GapResult
from app.schemas.pattern import PatternResult
from app.schemas.proposal import ProposalResult
from app.schemas.run import RunStatus
from eval.metrics import overlap, render_markdown, score_case, summarize, topic_recall
from tests.conftest import load_fixture, make_run

CASE = {
    "id": "case_x",
    "request_text": "x",
    "expected": {
        "pattern": "rag",
        "acceptable_patterns": ["rag"],
        "question_topics": ["data", "infra"],
        "can_proceed": True,
        "mvp_person_days": [40, 60],
        "must_not_mention": ["Quy định", "blockchain"],
    },
}


def done_run():
    run = make_run()
    run.status = RunStatus.DONE
    run.gaps = GapResult.model_validate(load_fixture("gaps"))
    run.pattern = PatternResult.model_validate(load_fixture("pattern"))
    run.architecture = ArchitectureResult.model_validate(load_fixture("architecture"))
    run.proposal = ProposalResult.model_validate(load_fixture("proposal"))
    run.step_latency_ms = {"intake": 1000, "gaps": 2000}
    return run


def test_overlap() -> None:
    assert overlap([30, 50], [40, 60])
    assert overlap([30, 40], [40, 60])
    assert not overlap([10, 20], [21, 30])


def test_topic_recall() -> None:
    assert topic_recall(["data", "infra"], {"data", "accuracy"}) == 0.5
    assert topic_recall([], set()) == 1.0


def test_score_done_case() -> None:
    result = score_case(CASE, done_run(), {"intake": 1, "gaps": 2, "pattern": 1})
    assert result["got"] == "rag" and result["pattern_ok"] is True
    assert result["topic_recall"] == 0.5
    assert result["mvp"] == [30, 50] and result["estimate_ok"] is True
    assert result["can_proceed_ok"] is True
    assert result["forbidden_hits"] == ["Quy định"]
    assert result["steps_run"] == 3 and result["steps_first_try"] == 2
    assert result["latency_ms"] == 3000


def test_waiting_clarification_counts_as_needs_clarification() -> None:
    run = make_run()
    run.status = RunStatus.WAITING_CLARIFICATION
    case = {
        "id": "c",
        "expected": {
            "pattern": "needs_clarification",
            "acceptable_patterns": ["needs_clarification"],
            "mvp_person_days": None,
        },
    }
    result = score_case(case, run, {"intake": 1, "gaps": 1})
    assert result["got"] == "needs_clarification" and result["pattern_ok"] is True
    assert result["estimate_ok"] is None


def test_summarize_and_render() -> None:
    a = score_case(CASE, done_run(), {"intake": 1, "gaps": 1})
    b = score_case(CASE, make_run(), {"intake": 3})
    summary = summarize([a, b])
    assert summary["pattern_correct"] == "1/2"
    assert summary["estimate_in_range"] == "1/2"
    assert summary["schema_success_rate"] == 2 / 3
    assert summary["topic_recall"] == 0.25
    markdown = render_markdown(summary, [a, b], "Test")
    assert "| case_x |" in markdown and "Pattern accuracy" in markdown


def test_eval_summary_build_flags_mock_only() -> None:
    from eval.summary import build

    report = {
        "name": "eval_1002_1000",
        "provider": "mock",
        "label": "v1",
        "summary": summarize([score_case(CASE, done_run(), {"intake": 1})]),
        "cases": [score_case(CASE, done_run(), {"intake": 1})],
    }
    text = build([report])
    assert "Chưa có report nào chạy bằng LLM thật" in text
    assert "| eval_1002_1000 | v1 | mock | 1 |" in text
    assert "### Tóm tắt" in text and "| case_x |" in text
