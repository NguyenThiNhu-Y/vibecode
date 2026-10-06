"""WBS of the bidding extension (docs/BIDDING_SPEC.md 3.1): a 3-level tree whose ids encode the
hierarchy ("1" group, "1.2" task, "1.2.3" sub-task). Only leaves carry an estimate; parents and
phase totals are always recomputed by code (`rollup`)."""

import math
import re
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import Phase, Priority, TaskTag, WorkType

PHASE_ORDER = [Phase.POC, Phase.MVP, Phase.PRODUCTION]
MAX_LEAF_MD = 10


class WbsItem(BaseModel):
    id: str  # "1", "1.2", "1.2.3"
    phase: Phase
    name: str  # task / sub-task name, Vietnamese
    level: int = Field(ge=1, le=3)  # 1 = group, 2 = task, 3 = sub-task
    type: WorkType | None = None  # required on leaves
    priority: Priority = Priority.MID
    estimate_md: float | None = Field(default=None, ge=0)  # leaves: <= 10 (checked on WbsResult)
    depends_on: list[str] = []
    deliverable: str | None = None
    tags: list[TaskTag] = []
    note: str | None = None


class PhaseTotal(BaseModel):
    phase: Phase
    total_md: float  # computed by code
    by_type: dict[WorkType, float]  # computed by code
    adjustment_note: str | None = None  # required when outside computed_estimates ±20%


class WbsResult(BaseModel):
    items: list[WbsItem] = Field(min_length=1, max_length=150)
    totals: list[PhaseTotal] = []  # the LLM may leave it empty; code overwrites
    assumptions: list[str] = []
    out_of_scope: list[str] = []

    @model_validator(mode="before")
    @classmethod
    def _legacy(cls, data: Any) -> Any:
        """Runs saved before the bidding extension had a flat `tasks` list."""
        if isinstance(data, dict) and "tasks" in data and "items" not in data:
            return _from_legacy(data)
        return data

    @model_validator(mode="after")
    def _rollup(self) -> "WbsResult":
        parents = {parent_id(i.id) for i in self.items}
        too_big = [
            i.id for i in self.items if i.id not in parents and (i.estimate_md or 0) > MAX_LEAF_MD
        ]
        if too_big:  # a parent holds the sum of its children, so only leaves are limited
            raise ValueError(f"Node lá tối đa {MAX_LEAF_MD} man-day, cần tách nhỏ: {too_big[:10]}")
        return rollup(self)  # parent and phase sums are never taken from the LLM


# ---------- tree helpers (pure; shared by the step validator, schedule and exports) ----------
def id_key(item_id: str) -> tuple[int, ...]:
    """Natural order of hierarchical ids: 1.2 < 1.10 < 2."""
    return tuple(int(p) if p.isdigit() else 0 for p in item_id.split("."))


def parent_id(item_id: str) -> str | None:
    return item_id.rsplit(".", 1)[0] if "." in item_id else None


def children_map(wbs: WbsResult) -> dict[str, list[WbsItem]]:
    kids: dict[str, list[WbsItem]] = {}
    for item in wbs.items:
        if (parent := parent_id(item.id)) is not None:
            kids.setdefault(parent, []).append(item)
    return kids


def leaves(wbs: WbsResult) -> list[WbsItem]:
    kids = children_map(wbs)
    return [i for i in wbs.items if i.id not in kids]


def ordered(wbs: WbsResult) -> list[WbsItem]:
    """Phase order, then natural id order (the order every export uses)."""
    return sorted(wbs.items, key=lambda i: (PHASE_ORDER.index(i.phase), id_key(i.id)))


def task_of(item_id: str) -> str:
    """The level-2 ancestor of a node (the node itself for level 1 and 2)."""
    parts = item_id.split(".")
    return ".".join(parts[:2])


def rollup(wbs: WbsResult) -> WbsResult:
    """Parent estimate = sum of its children; totals per phase and per type. Keeps the
    adjustment_note the LLM gave for a phase."""
    kids = children_map(wbs)
    by_id = {i.id: i for i in wbs.items}

    def total(item: WbsItem) -> float:
        if item.id not in kids:
            return item.estimate_md or 0.0
        item.estimate_md = round(sum(total(c) for c in kids[item.id]), 2)
        return item.estimate_md

    for item in wbs.items:
        if parent_id(item.id) is None or parent_id(item.id) not in by_id:
            total(item)
    notes = {t.phase: t.adjustment_note for t in wbs.totals}
    totals = []
    for phase in PHASE_ORDER:
        phase_leaves = [i for i in leaves(wbs) if i.phase == phase]
        if not phase_leaves:
            continue
        by_type: dict[WorkType, float] = {}
        for leaf in phase_leaves:
            if leaf.type is not None:
                by_type[leaf.type] = round(by_type.get(leaf.type, 0) + (leaf.estimate_md or 0), 2)
        totals.append(
            PhaseTotal(
                phase=phase,
                total_md=round(sum(i.estimate_md or 0 for i in phase_leaves), 2),
                by_type=by_type,
                adjustment_note=notes.get(phase),
            )
        )
    wbs.totals = totals
    return wbs


# ---------- legacy (flat) WBS ----------
_LEGACY_TYPES = [
    (r"\bpm\b|project manager|quản lý dự án", "PM"),
    (r"\bqa\b|test|kiểm thử", "QA"),
    (r"\bba\b|business analyst|phân tích", "BA"),
    (r"front|\bfe\b|ui", "FE"),
    (r"devops|infra|hạ tầng|sre", "INFRA"),
    (r"design|thiết kế giao diện", "DESIGN"),
    (r"data eng|dữ liệu|etl", "DATA"),
    (r"\bai\b|\bml\b|machine learning|llm|data scien", "AI"),
    (r"back|\bbe\b|api", "BE"),
]
_LEGACY_PHASE_NAMES = {"poc": "Giai đoạn PoC", "mvp": "Giai đoạn MVP", "production": "Production"}


def _legacy_type(role: str) -> str:
    text = role.lower()
    return next((t for pattern, t in _LEGACY_TYPES if re.search(pattern, text)), "BE")


def _from_legacy(data: dict[str, Any]) -> dict[str, Any]:
    tasks = data.get("tasks") or []
    items: list[dict[str, Any]] = []
    new_id: dict[str, str] = {}
    group = 0
    for phase in ("poc", "mvp", "production"):
        phase_tasks = [t for t in tasks if t.get("phase") == phase]
        if not phase_tasks:
            continue
        group += 1
        items.append(
            {"id": str(group), "phase": phase, "name": _LEGACY_PHASE_NAMES[phase], "level": 1}
        )
        for n, task in enumerate(phase_tasks, start=1):
            tid = f"{group}.{n}"
            new_id[task.get("id", tid)] = tid
            days = float(task.get("person_days") or 0)
            leaf = {
                "phase": phase,
                "type": _legacy_type(str(task.get("role", ""))),
                "deliverable": task.get("deliverable"),
                "note": task.get("role"),
            }
            base = {"id": tid, "name": task.get("name", tid), "level": 2,
                    "depends_on": task.get("depends_on", [])}  # fmt: skip
            if days <= MAX_LEAF_MD:
                items.append({**leaf, **base, "estimate_md": days})
                continue
            items.append({**base, "phase": phase})
            parts = math.ceil(days / MAX_LEAF_MD)
            for k in range(parts):
                chunk = min(MAX_LEAF_MD, round(days - k * MAX_LEAF_MD, 2))
                name = f"{base['name']} ({k + 1}/{parts})"
                items.append(
                    {**leaf, "id": f"{tid}.{k + 1}", "level": 3, "name": name, "estimate_md": chunk}
                )
    for item in items:
        item["depends_on"] = [new_id[d] for d in item.get("depends_on", []) if d in new_id]
    return {"items": items, "assumptions": data.get("notes", []), "out_of_scope": []}
