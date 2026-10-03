from pathlib import Path
from typing import Any

import yaml

from app.config import BACKEND_DIR

KB_DIR = BACKEND_DIR / "knowledge_base"

# Keys accepted by kb_text(). "solution_patterns:key_questions" keeps only id + key_questions.
_KEY_FILES: dict[str, str] = {
    "solution_patterns": "solution_patterns.yaml",
    "risk_checklist": "risk_checklist.yaml",
    "estimation_template": "estimation_template.yaml",
    "compliance_markets": "compliance_markets.yaml",
    "reference_projects": "reference_projects",
}

_cache: dict[tuple[str, str], str] = {}


def reload() -> None:
    """Drop cached KB content (dev helper after editing knowledge_base/)."""
    _cache.clear()


def load_yaml(name: str, kb_dir: Path | None = None) -> Any:
    path = (kb_dir or KB_DIR) / name
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _section(key: str, kb_dir: Path) -> str:
    base_key, _, view = key.partition(":")
    if base_key not in _KEY_FILES:
        raise KeyError(f"Unknown knowledge key '{key}'. Valid keys: {sorted(_KEY_FILES)}")
    target = kb_dir / _KEY_FILES[base_key]
    if target.is_dir():
        parts = [
            f"### {target.name}/{p.name}\n{p.read_text(encoding='utf-8').strip()}"
            for p in sorted(target.glob("*.md"))
        ]
        return "\n\n".join(parts)
    if not target.exists():
        raise KeyError(f"Knowledge file not found for key '{key}': {target}")
    text = target.read_text(encoding="utf-8").strip()
    if view == "key_questions":
        items = yaml.safe_load(text) or []
        slim = [{"id": i.get("id"), "key_questions": i.get("key_questions", [])} for i in items]
        text = yaml.safe_dump(slim, allow_unicode=True, sort_keys=False).strip()
        return f"### {target.name} (key_questions)\n{text}"
    if view:
        raise KeyError(f"Unknown view '{view}' for knowledge key '{base_key}'")
    return f"### {target.name}\n{text}"


def kb_text(keys: list[str], kb_dir: Path | None = None) -> str:
    """Concatenate knowledge files for `keys`, each under a `### <file name>` heading."""
    directory = kb_dir or KB_DIR
    sections = []
    for key in keys:
        cache_key = (str(directory), key)
        if cache_key not in _cache:
            _cache[cache_key] = _section(key, directory)
        sections.append(_cache[cache_key])
    return "\n\n".join(sections)
