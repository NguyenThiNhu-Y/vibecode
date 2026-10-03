import re
from dataclasses import dataclass, field

from app.ingest.digest import all_requirements
from app.schemas.run import ScopingRun

PATTERN_LABELS = {
    "no_ai_rule_based": "Không cần AI (quy tắc / script)",
    "classic_ml": "Machine learning truyền thống",
    "rag": "RAG – hỏi đáp trên tài liệu",
    "agent": "AI Agent – tự động hóa nhiều bước",
    "fine_tune": "Fine-tune model",
    "needs_clarification": "Cần làm rõ thêm",
}
PHASE_LABELS = {"poc": "PoC", "mvp": "MVP", "production": "Production"}
DEPLOYMENT_LABELS = {"cloud": "Cloud", "on_prem": "On-premise", "hybrid": "Hybrid"}
GO_LABELS = {
    "go": "Nên triển khai",
    "go_with_poc": "Triển khai qua PoC",
    "not_now": "Chưa nên triển khai",
}
CONFIDENCE_LABELS = {"low": "Thấp", "medium": "Trung bình", "high": "Cao"}
RISK_LABELS = {
    "data": "Dữ liệu",
    "accuracy": "Độ chính xác",
    "privacy": "Bảo mật",
    "compliance": "Tuân thủ",
    "cost": "Chi phí",
    "adoption": "Áp dụng",
}
COVERAGE_LABELS = {
    "full": "Đáp ứng",
    "partial": "Đáp ứng một phần",
    "not_supported": "Không đáp ứng",
    "needs_clarification": "Cần làm rõ",
}
COVERAGE_COLORS = {  # hex without '#'
    "full": "1F9D6B",
    "partial": "E3A008",
    "not_supported": "D64545",
    "needs_clarification": "6B7280",
}
ACCENT = "F26F21"
INK = "0C111D"


@dataclass
class Graph:
    nodes: dict[str, str] = field(default_factory=dict)  # id -> label
    edges: list[tuple[str, str]] = field(default_factory=list)


_NODE = re.compile(
    r"([A-Za-z_][\w-]*)\s*(\[\[|\[\(|\(\(|\[|\(|\{)([^\]\)\}]*)(\]\]|\)\]|\)\)|\]|\)|\})"
)
_ARROW = re.compile(r"\s*(?:-->|---|-\.->|==>)(?:\|[^|]*\|)?\s*")


def parse_mermaid(code: str | None) -> Graph:
    """Parse the subset of Mermaid flowcharts the architecture step produces."""
    graph = Graph()
    if not code:
        return graph
    for raw in code.splitlines()[1:]:
        line = raw.strip().rstrip(";")
        if not line or line.startswith(("%%", "classDef", "class ", "style", "subgraph", "end")):
            continue
        parts = _ARROW.split(line)
        ids: list[str] = []
        for part in parts:
            part = part.strip()
            match = _NODE.match(part)
            if match:
                node_id, label = match.group(1), match.group(3).strip().strip('"') or match.group(1)
                graph.nodes[node_id] = label
            else:
                node_id = re.split(r"\s", part)[0] if part else ""
                if not node_id:
                    continue
                graph.nodes.setdefault(node_id, node_id)
            ids.append(node_id)
        graph.edges.extend((a, b) for a, b in zip(ids, ids[1:], strict=False))
    return graph


def graph_for(run: ScopingRun) -> Graph:
    """Architecture graph from Mermaid, falling back to the component list."""
    graph = parse_mermaid(run.architecture.mermaid if run.architecture else None)
    if not graph.nodes and run.architecture:
        names = [c.name for c in run.architecture.components]
        graph.nodes = {f"c{i}": n for i, n in enumerate(names)}
        graph.edges = [(f"c{i}", f"c{i + 1}") for i in range(len(names) - 1)]
    return graph


def layers(graph: Graph) -> list[list[str]]:
    """Left-to-right columns by longest path from sources (cycle-safe)."""
    level = {n: 0 for n in graph.nodes}
    for _ in range(len(graph.nodes)):
        changed = False
        for a, b in graph.edges:
            if (
                a in level
                and b in level
                and level[b] < level[a] + 1
                and level[a] + 1 < len(graph.nodes)
            ):
                level[b] = level[a] + 1
                changed = True
        if not changed:
            break
    columns: dict[int, list[str]] = {}
    for node, lvl in level.items():
        columns.setdefault(lvl, []).append(node)
    return [columns[k] for k in sorted(columns)]


def requirement_texts(run: ScopingRun) -> dict[str, tuple[str, str | None, str | None]]:
    return {r.id: (r.text, r.priority, r.category) for r in all_requirements(run.attachments)}


def coverage_counts(run: ScopingRun) -> dict[str, int]:
    counts = dict.fromkeys(COVERAGE_LABELS, 0)
    if run.requirements and not run.requirements.skipped:
        for item in run.requirements.items:
            counts[item.coverage] += 1
    return counts


def total_ms(run: ScopingRun) -> int:
    return sum(run.step_latency_ms.values())
