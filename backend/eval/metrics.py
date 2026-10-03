"""Pure scoring helpers for the evaluation script (no LLM, no I/O)."""

import statistics
from typing import Any

from app.schemas.common import Phase, SolutionPattern
from app.schemas.run import RunStatus, ScopingRun


def overlap(a: list[int] | tuple[int, int], b: list[int] | tuple[int, int]) -> bool:
    return a[0] <= b[1] and b[0] <= a[1]


def topic_recall(expected: list[str], got: set[str]) -> float:
    if not expected:
        return 1.0
    return len(set(expected) & got) / len(set(expected))


def predicted_pattern(run: ScopingRun) -> str:
    """A run stopped at clarification counts as `needs_clarification`."""
    if run.status == RunStatus.WAITING_CLARIFICATION or run.pattern is None:
        return SolutionPattern.NEEDS_CLARIFICATION.value
    return run.pattern.pattern.value


def score_case(
    case: dict[str, Any], run: ScopingRun, calls_by_step: dict[str, int]
) -> dict[str, Any]:
    exp = case["expected"]
    got = predicted_pattern(run)
    topics = {q.topic.value for q in run.gaps.questions} if run.gaps else set()

    mvp = None
    if run.architecture:
        mvp = next((e for e in run.architecture.estimates if e.phase == Phase.MVP), None)
    expected_range = exp.get("mvp_person_days")
    estimate_ok = None
    if expected_range and mvp is not None:
        estimate_ok = overlap([mvp.min_person_days, mvp.max_person_days], expected_range)
    elif expected_range:
        estimate_ok = False

    text = (run.proposal.markdown if run.proposal else "").lower()
    return {
        "id": case["id"],
        "status": run.status.value,
        "expected": exp["pattern"],
        "got": got,
        "pattern_ok": got in exp.get("acceptable_patterns", [exp["pattern"]]),
        "topics": sorted(topics),
        "topic_recall": topic_recall(exp.get("question_topics", []), topics),
        "can_proceed_ok": (
            run.gaps.can_proceed == exp["can_proceed"]
            if run.gaps and "can_proceed" in exp
            else None
        ),
        "mvp": [mvp.min_person_days, mvp.max_person_days] if mvp else None,
        "estimate_ok": estimate_ok,
        "forbidden_hits": [w for w in exp.get("must_not_mention", []) if w.lower() in text],
        "steps_run": len(calls_by_step),
        "steps_first_try": sum(1 for n in calls_by_step.values() if n == 1),
        "latency_ms": sum(run.step_latency_ms.values()),
        "error": run.error,
    }


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(results)
    estimates = [r["estimate_ok"] for r in results if r["estimate_ok"] is not None]
    steps_run = sum(r["steps_run"] for r in results)
    latencies = [r["latency_ms"] for r in results if r["latency_ms"]]
    return {
        "cases": total,
        "pattern_accuracy": sum(r["pattern_ok"] for r in results) / total if total else 0.0,
        "pattern_correct": f"{sum(r['pattern_ok'] for r in results)}/{total}",
        "topic_recall": statistics.mean(r["topic_recall"] for r in results) if total else 0.0,
        "estimate_in_range": f"{sum(estimates)}/{len(estimates)}",
        "schema_success_rate": (
            sum(r["steps_first_try"] for r in results) / steps_run if steps_run else 0.0
        ),
        "avg_latency_s": round(statistics.mean(latencies) / 1000, 1) if latencies else 0.0,
        "errors": [r["id"] for r in results if r["error"]],
    }


def _fmt(value: Any) -> str:
    if value is None:
        return "–"
    if isinstance(value, bool):
        return "✅" if value else "❌"
    return str(value)


def render_markdown(summary: dict[str, Any], results: list[dict[str, Any]], title: str) -> str:
    lines = [
        f"# {title}",
        "",
        "## Tóm tắt",
        "",
        "| Metric | Giá trị |",
        "|---|---|",
        f"| Pattern accuracy | {summary['pattern_correct']} ({summary['pattern_accuracy']:.0%}) |",
        f"| Question topic recall | {summary['topic_recall']:.0%} |",
        f"| Estimate in range (MVP) | {summary['estimate_in_range']} |",
        f"| Schema success (không cần retry) | {summary['schema_success_rate']:.0%} |",
        f"| Latency trung bình | {summary['avg_latency_s']} s |",
        f"| Case lỗi | {', '.join(summary['errors']) or 'không'} |",
        "",
        "## Từng case",
        "",
        "| Case | Kỳ vọng | Kết quả | Pattern | Topic recall | MVP | Estimate | "
        "Từ cấm | Bước 1 lần/đã chạy | Latency (s) |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in results:
        mvp = f"{r['mvp'][0]}–{r['mvp'][1]}" if r["mvp"] else "–"
        lines.append(
            f"| {r['id']} | {r['expected']} | {r['got']} | {_fmt(r['pattern_ok'])} | "
            f"{r['topic_recall']:.0%} | {mvp} | {_fmt(r['estimate_ok'])} | "
            f"{', '.join(r['forbidden_hits']) or '–'} | {r['steps_first_try']}/{r['steps_run']} | "
            f"{r['latency_ms'] / 1000:.1f} |"
        )
    errors = [r for r in results if r["error"]]
    if errors:
        lines += ["", "## Lỗi", ""] + [f"- **{r['id']}**: {r['error']}" for r in errors]
    return "\n".join(lines) + "\n"
