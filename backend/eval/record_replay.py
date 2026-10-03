"""Record a pipeline run as a replay for offline demos.

Usage (from backend/):  python -m eval.record_replay --case case_01 [--attach a.xlsx b.csv ...]
Writes backend/replays/<case>.json. A run that stops at clarification is continued with the
case's optional `demo_answers`, recorded as a second segment. The final run is stored too, so
the offline demo can still download slides / Word / Excel.
"""

import argparse
import asyncio
import json
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.agents.pipeline import run_pipeline
from app.config import BACKEND_DIR, get_settings
from app.ingest import build_attachment
from app.llm.base import LLMClient, get_llm
from app.schemas.run import RunStatus, ScopingRun
from eval.common import NullRepo, case_paths, load_case, new_run

REPLAY_DIR = BACKEND_DIR / "replays"


async def record_segment(llm: LLMClient, run: ScopingRun) -> list[dict[str, Any]]:
    events = []
    last = time.perf_counter()
    async for event in run_pipeline(llm, run, NullRepo()):
        now = time.perf_counter()
        events.append({**event, "delay_ms": int((now - last) * 1000)})
        last = now
    return events


async def main(case_id: str, attach: list[str] | None = None) -> None:
    case = load_case(case_paths(case_id)[0])
    llm = get_llm(get_settings())
    run = new_run(case)
    for i, path in enumerate(attach or [], start=1):
        file = Path(path)
        run.attachments.append(build_attachment(f"a{i}", file.name, file.read_bytes()))
    segments: list[dict[str, Any]] = [{"answers": {}, "events": await record_segment(llm, run)}]

    answers = case.get("demo_answers") or {}
    if run.status == RunStatus.WAITING_CLARIFICATION and answers:
        run.answers.update(answers)
        run.gaps = None
        run.status = RunStatus.CREATED
        segments.append({"answers": answers, "events": await record_segment(llm, run)})

    REPLAY_DIR.mkdir(exist_ok=True)
    out = REPLAY_DIR / f"{case_id}.json"
    payload = {
        "name": case_id,
        "recorded_at": datetime.now(UTC).isoformat(),
        "llm_provider": get_settings().llm_provider,
        "request_text": case["request_text"],
        "segments": segments,
        "attachments": [a.model_dump(mode="json") for a in run.attachments],
        "final_run": run.model_dump(mode="json"),
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Đã lưu {out} ({len(segments)} đoạn, trạng thái cuối: {run.status.value})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ghi lại một run để phát lại khi demo")
    parser.add_argument("--case", required=True, help="Ví dụ case_01")
    parser.add_argument("--attach", nargs="*", default=[], help="File đính kèm (xlsx, csv, pdf…)")
    args = parser.parse_args()
    asyncio.run(main(args.case, args.attach))
