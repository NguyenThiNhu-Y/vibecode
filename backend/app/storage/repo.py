import sqlite3
from contextlib import closing
from pathlib import Path

from app.schemas.run import RunStatus, RunSummary, ScopingRun

_SCHEMA = (
    "CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, created_at TEXT, status TEXT, data TEXT)"
)


class RunRepo:
    """SQLite storage: one row per run, full ScopingRun JSON in `data`."""

    def __init__(self, db_path: str | Path):
        self.db_path = str(db_path)
        if self.db_path != ":memory:":
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as conn, conn:
            conn.execute(_SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def save(self, run: ScopingRun) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute(
                "INSERT INTO runs (id, created_at, status, data) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data",
                (run.id, run.created_at.isoformat(), run.status.value, run.model_dump_json()),
            )

    def get(self, run_id: str) -> ScopingRun | None:
        with closing(self._connect()) as conn:
            row = conn.execute("SELECT data FROM runs WHERE id = ?", (run_id,)).fetchone()
        return ScopingRun.model_validate_json(row[0]) if row else None

    def list_recent(self, limit: int = 50) -> list[RunSummary]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT data FROM runs ORDER BY created_at DESC, rowid DESC LIMIT ?", (limit,)
            ).fetchall()
        return [RunSummary.from_run(ScopingRun.model_validate_json(r[0])) for r in rows]

    def reset_running(self) -> int:
        """Runs left in `running` by a crashed server become resumable (`created`)."""
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT data FROM runs WHERE status = ?", (RunStatus.RUNNING.value,)
            ).fetchall()
        for (data,) in rows:
            run = ScopingRun.model_validate_json(data)
            run.status = RunStatus.CREATED
            self.save(run)
        return len(rows)

    def all_runs(self, limit: int = 500) -> list[ScopingRun]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT data FROM runs ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [ScopingRun.model_validate_json(r[0]) for r in rows]
