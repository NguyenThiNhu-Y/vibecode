import pytest

from app.knowledge import loader


def test_kb_text_has_heading() -> None:
    text = loader.kb_text(["solution_patterns"])
    assert text.startswith("### solution_patterns.yaml")
    assert "no_ai_rule_based" in text


def test_kb_text_joins_multiple_and_directory() -> None:
    text = loader.kb_text(["risk_checklist", "reference_projects"])
    assert "### risk_checklist.yaml" in text
    assert "### reference_projects/rp_example.md" in text


def test_key_questions_view_only_keeps_questions() -> None:
    text = loader.kb_text(["solution_patterns:key_questions"])
    assert "key_questions" in text
    assert "use_when" not in text


def test_unknown_key_raises_clear_keyerror() -> None:
    with pytest.raises(KeyError, match="Unknown knowledge key"):
        loader.kb_text(["does_not_exist"])


def test_cache_and_reload(tmp_path) -> None:
    (tmp_path / "risk_checklist.yaml").write_text("- id: a\n", encoding="utf-8")
    assert "id: a" in loader.kb_text(["risk_checklist"], kb_dir=tmp_path)
    (tmp_path / "risk_checklist.yaml").write_text("- id: b\n", encoding="utf-8")
    assert "id: a" in loader.kb_text(["risk_checklist"], kb_dir=tmp_path)
    loader.reload()
    assert "id: b" in loader.kb_text(["risk_checklist"], kb_dir=tmp_path)


def test_total_kb_size_under_limit() -> None:
    text = loader.kb_text(
        ["solution_patterns", "risk_checklist", "estimation_template", "reference_projects"]
    )
    assert len(text) < 30_000
