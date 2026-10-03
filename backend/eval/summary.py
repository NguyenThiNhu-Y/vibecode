"""Build docs/eval_summary.md from every report in eval/reports/.

Usage (from backend/):  python -m eval.summary
"""

import json
from pathlib import Path
from typing import Any

from eval.common import EVAL_DIR
from eval.metrics import render_markdown

REPORTS_DIR = EVAL_DIR / "reports"
DOCS_PATH = EVAL_DIR.parent.parent / "docs" / "eval_summary.md"


def load_reports() -> list[dict[str, Any]]:
    reports = []
    for path in sorted(REPORTS_DIR.glob("eval_*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        data["name"] = path.stem
        reports.append(data)
    return reports


def build(reports: list[dict[str, Any]]) -> str:
    lines = [
        "# ScopeAI – Kết quả evaluation",
        "",
        "Sinh tự động bằng `python -m eval.summary` từ `backend/eval/reports/`.",
        "Bộ test gồm các case giả lập trong `backend/eval/cases/`.",
        "",
    ]
    real = [r for r in reports if r.get("provider") != "mock"]
    if not real:
        lines += [
            "> ⚠️ Chưa có report nào chạy bằng LLM thật. Các số liệu dưới đây (nếu có) là từ",
            "> `LLM_PROVIDER=mock` và chỉ chứng minh script chạy đúng, KHÔNG phản ánh chất lượng.",
            "",
        ]
    lines += [
        "## Tiến triển qua các lần chạy",
        "",
        "| Report | Nhãn | LLM | Case | Pattern accuracy | Topic recall | Estimate in range | "
        "Schema success | Latency TB |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for r in reports:
        s = r.get("summary", {})
        lines.append(
            f"| {r['name']} | {r.get('label') or '–'} | {r.get('provider')} | "
            f"{s.get('cases', '–')} | "
            f"{s.get('pattern_correct', '–')} ({s.get('pattern_accuracy', 0):.0%}) | "
            f"{s.get('topic_recall', 0):.0%} | {s.get('estimate_in_range', '–')} | "
            f"{s.get('schema_success_rate', 0):.0%} | {s.get('avg_latency_s', 0)} s |"
        )
    if reports:
        latest = (real or reports)[-1]
        rows = [{k: v for k, v in c.items() if k != "outputs"} for c in latest.get("cases", [])]
        detail = render_markdown(latest.get("summary", {}), rows, f"Chi tiết: {latest['name']}")
        lines += ["", detail.replace("# Chi tiết", "## Chi tiết", 1).replace("\n## ", "\n### ")]
    return "\n".join(lines).rstrip() + "\n"


def main() -> Path:
    DOCS_PATH.parent.mkdir(parents=True, exist_ok=True)
    DOCS_PATH.write_text(build(load_reports()), encoding="utf-8")
    print(f"Đã ghi {DOCS_PATH}")
    return DOCS_PATH


if __name__ == "__main__":
    main()
