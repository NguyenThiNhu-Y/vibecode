"""Evaluate the pipeline on eval/cases/*.yaml.

Usage (from backend/):  python -m eval.run_eval [--case case_01] [--label "prompt v2"]
Uses LLM_PROVIDER from .env / environment; cases run sequentially to avoid rate limits.
"""

import argparse
import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from app.agents.pipeline import run_pipeline
from app.config import get_settings
from eval.common import EVAL_DIR, CountingLLM, NullRepo, case_paths, load_case, make_llm, new_run
from eval.metrics import render_markdown, score_case, summarize

REPORTS_DIR = EVAL_DIR / "reports"


async def eval_case(path: Path) -> dict[str, Any]:
    case = load_case(path)
    llm = CountingLLM(make_llm())
    run = new_run(case)
    async for _ in run_pipeline(llm, run, NullRepo()):
        pass
    result = score_case(case, run, dict(llm.calls))
    result["outputs"] = run.model_dump(mode="json", exclude={"request_text"})
    return result


async def main(case_id: str | None, label: str | None = None) -> Path:
    provider = get_settings().llm_provider
    results = []
    for path in case_paths(case_id):
        print(f"→ {path.stem} ...", flush=True)
        result = await eval_case(path)
        print(f"  {result['got']} (kỳ vọng {result['expected']}) status={result['status']}")
        results.append(result)

    summary = summarize(results)
    stamp = datetime.now().strftime("%m%d_%H%M")
    REPORTS_DIR.mkdir(exist_ok=True)
    json_path = REPORTS_DIR / f"eval_{stamp}.json"
    json_path.write_text(
        json.dumps(
            {
                "provider": provider,
                "label": label,
                "created_at": datetime.now().isoformat(timespec="seconds"),
                "summary": summary,
                "cases": results,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    table_rows = [{k: v for k, v in r.items() if k != "outputs"} for r in results]
    title = f"ScopeAI eval {stamp} (LLM_PROVIDER={provider})" + (f" – {label}" if label else "")
    md_path = json_path.with_suffix(".md")
    md_path.write_text(render_markdown(summary, table_rows, title), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"Report: {json_path} | {md_path}")
    return md_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Chạy evaluation ScopeAI")
    parser.add_argument("--case", help="Chỉ chạy một case, ví dụ case_01")
    parser.add_argument("--label", help="Nhãn phiên bản prompt, ví dụ 'prompt v2'")
    args = parser.parse_args()
    asyncio.run(main(args.case, args.label))
