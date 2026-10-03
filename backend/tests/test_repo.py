from datetime import UTC, datetime, timedelta

from app.schemas.intake import IntakeResult
from app.schemas.run import RunStatus, ScopingRun
from app.storage.repo import RunRepo
from tests.conftest import load_fixture, make_run


def test_save_then_get_roundtrip(tmp_path) -> None:
    repo = RunRepo(tmp_path / "test.db")
    run = make_run()
    run.intake = IntakeResult.model_validate(load_fixture("intake"))
    run.answers = {"q1": "Câu trả lời"}
    repo.save(run)
    assert repo.get(run.id) == run


def test_get_missing_returns_none(tmp_path) -> None:
    assert RunRepo(tmp_path / "test.db").get("nope") is None


def test_save_twice_updates(tmp_path) -> None:
    repo = RunRepo(tmp_path / "test.db")
    run = make_run()
    repo.save(run)
    run.status = RunStatus.DONE
    repo.save(run)
    stored = repo.get(run.id)
    assert stored is not None and stored.status == RunStatus.DONE
    assert len(repo.list_recent(10)) == 1


def test_list_recent_newest_first(tmp_path) -> None:
    repo = RunRepo(tmp_path / "nested" / "test.db")
    now = datetime.now(UTC)
    for i in range(3):
        repo.save(
            ScopingRun(id=f"run{i}", created_at=now + timedelta(minutes=i), request_text="x" * 40)
        )
    summaries = repo.list_recent(2)
    assert [s.id for s in summaries] == ["run2", "run1"]
    assert summaries[0].business_goal is None and summaries[0].pattern is None
