from __future__ import annotations

import json
import os
import sqlite3
from abc import ABC, abstractmethod
from functools import lru_cache
from pathlib import Path
from typing import Any

from .models import CandidateConfig, DiagnosticLesson, RunEvent, RunRecord, Scorecard, utc_now
from .tenancy import current_tenant_id


DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "assay.db"


class DataStore(ABC):
    name: str

    @abstractmethod
    def init(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def health(self) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def save_candidate(self, candidate: CandidateConfig) -> CandidateConfig:
        raise NotImplementedError

    @abstractmethod
    def list_candidates(self) -> list[CandidateConfig]:
        raise NotImplementedError

    @abstractmethod
    def get_candidate(self, candidate_id: str) -> CandidateConfig | None:
        raise NotImplementedError

    @abstractmethod
    def save_run(self, run: RunRecord) -> RunRecord:
        raise NotImplementedError

    @abstractmethod
    def list_runs(self) -> list[RunRecord]:
        raise NotImplementedError

    @abstractmethod
    def get_run(self, run_id: str) -> RunRecord | None:
        raise NotImplementedError

    @abstractmethod
    def save_event(self, event: RunEvent) -> RunEvent:
        raise NotImplementedError

    @abstractmethod
    def list_events(self, run_id: str) -> list[RunEvent]:
        raise NotImplementedError

    @abstractmethod
    def save_scorecard(self, scorecard: Scorecard) -> Scorecard:
        raise NotImplementedError

    @abstractmethod
    def get_scorecard(self, run_id: str) -> Scorecard | None:
        raise NotImplementedError

    @abstractmethod
    def list_runs_for_candidate(self, candidate_id: str) -> list[RunRecord]:
        raise NotImplementedError

    @abstractmethod
    def save_lesson(self, lesson: DiagnosticLesson) -> DiagnosticLesson:
        raise NotImplementedError

    @abstractmethod
    def list_lessons_for_candidate(
        self,
        candidate_id: str,
        exam_pack_id: str | None = None,
        competencies: list[str] | None = None,
        active_only: bool = True,
    ) -> list[DiagnosticLesson]:
        raise NotImplementedError

    @abstractmethod
    def get_lesson(self, lesson_id: str) -> DiagnosticLesson | None:
        raise NotImplementedError


class SQLiteStore(DataStore):
    name = "sqlite"

    def __init__(self, path: Path | None = None):
        self.path = path or db_path()

    def connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def init(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS candidates (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL DEFAULT 'local',
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL DEFAULT 'local',
                    candidate_id TEXT NOT NULL,
                    exam_pack_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS events (
                    span_id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL DEFAULT 'local',
                    run_id TEXT NOT NULL,
                    sequence INTEGER NOT NULL,
                    payload TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS scorecards (
                    run_id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL DEFAULT 'local',
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS lessons (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL DEFAULT 'local',
                    candidate_id TEXT NOT NULL,
                    exam_pack_id TEXT NOT NULL,
                    competency TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )
            self._ensure_tenant_columns(conn)
            conn.executescript(
                """
                CREATE INDEX IF NOT EXISTS idx_events_tenant_run_sequence
                ON events(tenant_id, run_id, sequence);

                CREATE INDEX IF NOT EXISTS idx_candidates_tenant_created
                ON candidates(tenant_id, created_at);

                CREATE INDEX IF NOT EXISTS idx_runs_tenant_created
                ON runs(tenant_id, created_at);

                CREATE INDEX IF NOT EXISTS idx_lessons_tenant_candidate
                ON lessons(tenant_id, candidate_id, exam_pack_id, competency, active);
                """
            )

    @staticmethod
    def _ensure_tenant_columns(conn: sqlite3.Connection) -> None:
        for table in ("candidates", "runs", "events", "scorecards", "lessons"):
            columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
            if "tenant_id" not in columns:
                conn.execute(
                    f"ALTER TABLE {table} ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'local'"
                )

    def health(self) -> dict[str, Any]:
        self.init()
        with self.connect() as conn:
            candidates = conn.execute("SELECT COUNT(*) AS count FROM candidates").fetchone()["count"]
            runs = conn.execute("SELECT COUNT(*) AS count FROM runs").fetchone()["count"]
        return {
            "backend": self.name,
            "ok": True,
            "path": str(self.path),
            "tables": {
                "candidates": candidates,
                "runs": runs,
            },
        }

    def save_candidate(self, candidate: CandidateConfig) -> CandidateConfig:
        candidate = _with_current_tenant(candidate)
        with self.connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO candidates (id, tenant_id, payload, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (candidate.id, candidate.tenant_id, _dump_model(candidate), candidate.created_at.isoformat()),
            )
        return candidate

    def list_candidates(self) -> list[CandidateConfig]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT payload FROM candidates WHERE tenant_id = ? ORDER BY created_at DESC",
                (current_tenant_id(),),
            ).fetchall()
        return [_load_candidate(row["payload"]) for row in rows]

    def get_candidate(self, candidate_id: str) -> CandidateConfig | None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT payload FROM candidates WHERE id = ? AND tenant_id = ?",
                (candidate_id, current_tenant_id()),
            ).fetchone()
        return _load_candidate(row["payload"]) if row else None

    def save_run(self, run: RunRecord) -> RunRecord:
        run = _with_current_tenant(run)
        run.updated_at = utc_now()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO runs
                (id, tenant_id, candidate_id, exam_pack_id, status, payload, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run.id,
                    run.tenant_id,
                    run.candidate_id,
                    run.exam_pack_id,
                    run.status,
                    _dump_model(run),
                    run.created_at.isoformat(),
                    run.updated_at.isoformat(),
                ),
            )
        return run

    def list_runs(self) -> list[RunRecord]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT payload FROM runs WHERE tenant_id = ? ORDER BY created_at DESC",
                (current_tenant_id(),),
            ).fetchall()
        return [RunRecord.model_validate_json(row["payload"]) for row in rows]

    def get_run(self, run_id: str) -> RunRecord | None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT payload FROM runs WHERE id = ? AND tenant_id = ?",
                (run_id, current_tenant_id()),
            ).fetchone()
        return RunRecord.model_validate_json(row["payload"]) if row else None

    def save_event(self, event: RunEvent) -> RunEvent:
        event = _with_current_tenant(event)
        with self.connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO events (span_id, tenant_id, run_id, sequence, payload)
                VALUES (?, ?, ?, ?, ?)
                """,
                (event.span_id, event.tenant_id, event.run_id, event.sequence, _dump_model(event)),
            )
        return event

    def list_events(self, run_id: str) -> list[RunEvent]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT payload FROM events WHERE run_id = ? AND tenant_id = ? ORDER BY sequence ASC",
                (run_id, current_tenant_id()),
            ).fetchall()
        return [RunEvent.model_validate_json(row["payload"]) for row in rows]

    def save_scorecard(self, scorecard: Scorecard) -> Scorecard:
        scorecard = _with_current_tenant(scorecard)
        with self.connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO scorecards (run_id, tenant_id, payload, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    scorecard.run_id,
                    scorecard.tenant_id,
                    _dump_model(scorecard),
                    scorecard.created_at.isoformat(),
                ),
            )
        return scorecard

    def get_scorecard(self, run_id: str) -> Scorecard | None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT payload FROM scorecards WHERE run_id = ? AND tenant_id = ?",
                (run_id, current_tenant_id()),
            ).fetchone()
        return Scorecard.model_validate_json(row["payload"]) if row else None

    def list_runs_for_candidate(self, candidate_id: str) -> list[RunRecord]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT payload FROM runs WHERE candidate_id = ? AND tenant_id = ? ORDER BY created_at ASC",
                (candidate_id, current_tenant_id()),
            ).fetchall()
        return [RunRecord.model_validate_json(row["payload"]) for row in rows]

    def save_lesson(self, lesson: DiagnosticLesson) -> DiagnosticLesson:
        lesson = _with_current_tenant(lesson)
        lesson.updated_at = utc_now()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO lessons
                (id, tenant_id, candidate_id, exam_pack_id, competency, active, payload, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    lesson.id,
                    lesson.tenant_id,
                    lesson.candidate_id,
                    lesson.exam_pack_id,
                    lesson.competency,
                    1 if lesson.active else 0,
                    _dump_model(lesson),
                    lesson.created_at.isoformat(),
                    lesson.updated_at.isoformat(),
                ),
            )
        return lesson

    def list_lessons_for_candidate(
        self,
        candidate_id: str,
        exam_pack_id: str | None = None,
        competencies: list[str] | None = None,
        active_only: bool = True,
    ) -> list[DiagnosticLesson]:
        clauses = ["tenant_id = ?", "candidate_id = ?"]
        params: list[Any] = [current_tenant_id(), candidate_id]
        if exam_pack_id is not None:
            clauses.append("exam_pack_id = ?")
            params.append(exam_pack_id)
        if competencies:
            placeholders = ", ".join("?" for _ in competencies)
            clauses.append(f"competency IN ({placeholders})")
            params.extend(competencies)
        if active_only:
            clauses.append("active = 1")
        query = f"SELECT payload FROM lessons WHERE {' AND '.join(clauses)} ORDER BY created_at DESC"
        with self.connect() as conn:
            rows = conn.execute(query, tuple(params)).fetchall()
        return [DiagnosticLesson.model_validate_json(row["payload"]) for row in rows]

    def get_lesson(self, lesson_id: str) -> DiagnosticLesson | None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT payload FROM lessons WHERE id = ? AND tenant_id = ?",
                (lesson_id, current_tenant_id()),
            ).fetchone()
        return DiagnosticLesson.model_validate_json(row["payload"]) if row else None


class SupabaseStore(DataStore):
    name = "supabase"

    DEFAULT_TABLES = {
        "candidates": "assay_candidates",
        "runs": "assay_runs",
        "events": "assay_events",
        "scorecards": "assay_scorecards",
        "lessons": "assay_lessons",
    }
    LEGACY_TABLES = {
        "candidates": "interviu_candidates",
        "runs": "interviu_runs",
        "events": "interviu_events",
        "scorecards": "interviu_scorecards",
        "lessons": "interviu_lessons",
    }
    CORE_TABLES = ("candidates", "runs", "events", "scorecards")

    def __init__(self, url: str, key: str):
        try:
            from supabase import create_client
        except ImportError as exc:
            raise RuntimeError("Install the 'supabase' Python package to use Supabase persistence.") from exc
        self.client = create_client(url, key)
        self.tables = dict(self.DEFAULT_TABLES)
        self._available_tables: set[str] = set(self.tables)
        self._tenant_tables: set[str] = set(self.tables)
        self._schema_checked = False

    def init(self) -> None:
        # Supabase schema is managed by supabase/migrations/*.sql.
        self._ensure_schema()
        self.client.table(self.tables["candidates"]).select("id").limit(1).execute()

    def health(self) -> dict[str, Any]:
        self._ensure_schema()
        table_status: dict[str, Any] = {}
        for logical_name, table in self.tables.items():
            if logical_name not in self._available_tables:
                table_status[logical_name] = {
                    "table": table,
                    "available": False,
                    "count": None,
                }
                continue
            response = self.client.table(table).select("*", count="exact").limit(1).execute()
            table_status[logical_name] = {
                "table": table,
                "available": True,
                "tenant_scoped": logical_name in self._tenant_tables,
                "count": response.count,
            }
        return {
            "backend": self.name,
            "ok": all(table in self._available_tables for table in self.CORE_TABLES),
            "schema": "legacy-interviu" if self.tables["candidates"].startswith("interviu_") else "assay",
            "tables": table_status,
        }

    def save_candidate(self, candidate: CandidateConfig) -> CandidateConfig:
        self._ensure_schema()
        candidate = _with_current_tenant(candidate)
        self._upsert(
            "candidates",
            self._with_tenant(
                "candidates",
                {
                "id": candidate.id,
                "payload": candidate.model_dump(mode="json"),
                "created_at": candidate.created_at.isoformat(),
                },
                candidate.tenant_id,
            ),
            "id",
        )
        return candidate

    def list_candidates(self) -> list[CandidateConfig]:
        self._ensure_schema()
        rows = self._select("candidates", order="created_at", desc=True)
        return [_load_candidate(row["payload"]) for row in rows]

    def get_candidate(self, candidate_id: str) -> CandidateConfig | None:
        self._ensure_schema()
        row = self._single("candidates", "id", candidate_id)
        return _load_candidate(row["payload"]) if row else None

    def save_run(self, run: RunRecord) -> RunRecord:
        self._ensure_schema()
        run = _with_current_tenant(run)
        run.updated_at = utc_now()
        self._upsert(
            "runs",
            self._with_tenant(
                "runs",
                {
                "id": run.id,
                "candidate_id": run.candidate_id,
                "exam_pack_id": run.exam_pack_id,
                "status": run.status,
                "payload": run.model_dump(mode="json"),
                "created_at": run.created_at.isoformat(),
                "updated_at": run.updated_at.isoformat(),
                },
                run.tenant_id,
            ),
            "id",
        )
        return run

    def list_runs(self) -> list[RunRecord]:
        self._ensure_schema()
        rows = self._select("runs", order="created_at", desc=True)
        return [RunRecord.model_validate(row["payload"]) for row in rows]

    def get_run(self, run_id: str) -> RunRecord | None:
        self._ensure_schema()
        row = self._single("runs", "id", run_id)
        return RunRecord.model_validate(row["payload"]) if row else None

    def save_event(self, event: RunEvent) -> RunEvent:
        self._ensure_schema()
        event = _with_current_tenant(event)
        self._upsert(
            "events",
            self._with_tenant(
                "events",
                {
                "span_id": event.span_id,
                "run_id": event.run_id,
                "sequence": event.sequence,
                "payload": event.model_dump(mode="json"),
                "created_at": event.started_at.isoformat(),
                },
                event.tenant_id,
            ),
            "span_id",
        )
        return event

    def list_events(self, run_id: str) -> list[RunEvent]:
        self._ensure_schema()
        query = self.client.table(self.tables["events"]).select("payload").eq("run_id", run_id)
        response = self._with_tenant_filter("events", query).order("sequence").execute()
        return [RunEvent.model_validate(row["payload"]) for row in response.data or []]

    def save_scorecard(self, scorecard: Scorecard) -> Scorecard:
        self._ensure_schema()
        scorecard = _with_current_tenant(scorecard)
        self._upsert(
            "scorecards",
            self._with_tenant(
                "scorecards",
                {
                "run_id": scorecard.run_id,
                "payload": scorecard.model_dump(mode="json"),
                "created_at": scorecard.created_at.isoformat(),
                },
                scorecard.tenant_id,
            ),
            "run_id",
        )
        return scorecard

    def get_scorecard(self, run_id: str) -> Scorecard | None:
        self._ensure_schema()
        row = self._single("scorecards", "run_id", run_id)
        return Scorecard.model_validate(row["payload"]) if row else None

    def list_runs_for_candidate(self, candidate_id: str) -> list[RunRecord]:
        self._ensure_schema()
        query = self.client.table(self.tables["runs"]).select("payload").eq("candidate_id", candidate_id)
        response = self._with_tenant_filter("runs", query).order("created_at").execute()
        return [RunRecord.model_validate(row["payload"]) for row in response.data or []]

    def save_lesson(self, lesson: DiagnosticLesson) -> DiagnosticLesson:
        self._ensure_schema()
        if "lessons" not in self._available_tables:
            return lesson
        lesson = _with_current_tenant(lesson)
        lesson.updated_at = utc_now()
        self._upsert(
            "lessons",
            self._with_tenant(
                "lessons",
                {
                "id": lesson.id,
                "candidate_id": lesson.candidate_id,
                "exam_pack_id": lesson.exam_pack_id,
                "competency": lesson.competency,
                "active": lesson.active,
                "payload": lesson.model_dump(mode="json"),
                "created_at": lesson.created_at.isoformat(),
                "updated_at": lesson.updated_at.isoformat(),
                },
                lesson.tenant_id,
            ),
            "id",
        )
        return lesson

    def list_lessons_for_candidate(
        self,
        candidate_id: str,
        exam_pack_id: str | None = None,
        competencies: list[str] | None = None,
        active_only: bool = True,
    ) -> list[DiagnosticLesson]:
        self._ensure_schema()
        if "lessons" not in self._available_tables:
            return []
        query = self.client.table(self.tables["lessons"]).select("payload").eq("candidate_id", candidate_id)
        query = self._with_tenant_filter("lessons", query)
        if exam_pack_id is not None:
            query = query.eq("exam_pack_id", exam_pack_id)
        if competencies:
            query = query.in_("competency", competencies)
        if active_only:
            query = query.eq("active", True)
        response = query.order("created_at", desc=True).execute()
        return [DiagnosticLesson.model_validate(row["payload"]) for row in response.data or []]

    def get_lesson(self, lesson_id: str) -> DiagnosticLesson | None:
        self._ensure_schema()
        if "lessons" not in self._available_tables:
            return None
        row = self._single("lessons", "id", lesson_id)
        return DiagnosticLesson.model_validate(row["payload"]) if row else None

    def _upsert(self, logical_table: str, row: dict[str, Any], on_conflict: str) -> None:
        if logical_table not in self._available_tables:
            return
        self.client.table(self.tables[logical_table]).upsert(row, on_conflict=on_conflict).execute()

    def _select(self, logical_table: str, order: str, desc: bool = False) -> list[dict[str, Any]]:
        if logical_table not in self._available_tables:
            return []
        query = self.client.table(self.tables[logical_table]).select("payload")
        response = self._with_tenant_filter(logical_table, query).order(order, desc=desc).execute()
        return response.data or []

    def _single(self, logical_table: str, column: str, value: str) -> dict[str, Any] | None:
        if logical_table not in self._available_tables:
            return None
        query = self.client.table(self.tables[logical_table]).select("payload").eq(column, value)
        response = self._with_tenant_filter(logical_table, query).limit(1).execute()
        rows = response.data or []
        return rows[0] if rows else None

    def _with_tenant_filter(self, logical_table: str, query: Any) -> Any:
        if logical_table in self._tenant_tables:
            query = query.eq("tenant_id", current_tenant_id())
        return query

    def _with_tenant(self, logical_table: str, row: dict[str, Any], tenant_id: str) -> dict[str, Any]:
        if logical_table in self._tenant_tables:
            return {**row, "tenant_id": tenant_id}
        return row

    def _ensure_schema(self) -> None:
        if self._schema_checked:
            return
        configured_prefix = os.environ.get("ASSAY_SUPABASE_TABLE_PREFIX", "").strip().lower()
        if configured_prefix == "interviu":
            self.tables = dict(self.LEGACY_TABLES)
        elif configured_prefix == "assay":
            self.tables = dict(self.DEFAULT_TABLES)
        elif not self._can_select(self.tables["candidates"], "id"):
            legacy_candidates = self.LEGACY_TABLES["candidates"]
            if self._can_select(legacy_candidates, "id"):
                self.tables = dict(self.LEGACY_TABLES)
        self._available_tables = {
            logical_name
            for logical_name, table in self.tables.items()
            if self._can_select(table, "payload")
        }
        self._tenant_tables = {
            logical_name
            for logical_name, table in self.tables.items()
            if logical_name in self._available_tables and self._can_select(table, "tenant_id")
        }
        self._schema_checked = True

    def _can_select(self, table: str, column: str) -> bool:
        try:
            self.client.table(table).select(column).limit(1).execute()
        except Exception:
            return False
        return True


def db_path() -> Path:
    return Path(os.environ.get("ASSAY_DB_PATH", DEFAULT_DB_PATH))


def database_backend_name() -> str:
    return store().name


def database_configured() -> bool:
    try:
        store()
        return True
    except Exception:
        return False


def database_health() -> dict[str, Any]:
    return store().health()


def init_db() -> None:
    store().init()


def save_candidate(candidate: CandidateConfig) -> CandidateConfig:
    return store().save_candidate(candidate)


def list_candidates() -> list[CandidateConfig]:
    return store().list_candidates()


def get_candidate(candidate_id: str) -> CandidateConfig | None:
    return store().get_candidate(candidate_id)


def save_run(run: RunRecord) -> RunRecord:
    return store().save_run(run)


def list_runs() -> list[RunRecord]:
    return store().list_runs()


def get_run(run_id: str) -> RunRecord | None:
    return store().get_run(run_id)


def save_event(event: RunEvent) -> RunEvent:
    return store().save_event(event)


def list_events(run_id: str) -> list[RunEvent]:
    return store().list_events(run_id)


def save_scorecard(scorecard: Scorecard) -> Scorecard:
    return store().save_scorecard(scorecard)


def get_scorecard(run_id: str) -> Scorecard | None:
    return store().get_scorecard(run_id)


def list_runs_for_candidate(candidate_id: str) -> list[RunRecord]:
    return store().list_runs_for_candidate(candidate_id)


def save_lesson(lesson: DiagnosticLesson) -> DiagnosticLesson:
    return store().save_lesson(lesson)


def list_lessons_for_candidate(
    candidate_id: str,
    exam_pack_id: str | None = None,
    competencies: list[str] | None = None,
    active_only: bool = True,
) -> list[DiagnosticLesson]:
    return store().list_lessons_for_candidate(candidate_id, exam_pack_id, competencies, active_only)


def get_lesson(lesson_id: str) -> DiagnosticLesson | None:
    return store().get_lesson(lesson_id)


def trace_payload(run_id: str) -> dict[str, Any]:
    events = [event.model_dump(mode="json") for event in list_events(run_id)]
    scorecard = get_scorecard(run_id)
    return {
        "run_id": run_id,
        "events": events,
        "scorecard": scorecard.model_dump(mode="json") if scorecard else None,
    }


def proof_bundle(run_id: str) -> dict[str, Any] | None:
    run = get_run(run_id)
    if run is None:
        return None
    candidate = get_candidate(run.candidate_id)
    scorecard = get_scorecard(run_id)
    events = [event.model_dump(mode="json") for event in list_events(run_id)]
    try:
        from .product_review import product_review_for_run

        product_review = product_review_for_run(run_id)
    except Exception:
        product_review = None
    # What the judge was qualified with (Phase 1-2): the persisted role brief and,
    # for tailored runs, the generated exam pack — so the bundle proves not just
    # the verdict but the bespoke rubric it was graded against.
    role_brief = None
    for event in reversed(events):
        if event.get("event_type") == "role_qualified":
            role_brief = event.get("payload")
            break
    tailored_exam_pack = _tailored_pack_payload(run.generated_pack_id)
    qualification_status = scorecard.qualification_status if scorecard else None
    return {
        "schema": "assay.proof_bundle.v1",
        "product": "Assay",
        "tenant_id": run.tenant_id,
        "generated_at": utc_now().isoformat(),
        "run": run.model_dump(mode="json"),
        "candidate": candidate.model_dump(mode="json") if candidate else None,
        "scorecard": scorecard.model_dump(mode="json") if scorecard else None,
        "events": events,
        "role_brief": role_brief,
        "tailored_exam_pack": tailored_exam_pack,
        "summary": {
            "status": run.status,
            "certified": scorecard.certified if scorecard else False,
            "certificate_label": scorecard.certificate_label if scorecard else "Internal capability bar only",
            "tas_score": scorecard.trace_audit.tas_score if scorecard else None,
            "trace_status": scorecard.trace_audit.status if scorecard else "pending",
            "qualification_status": qualification_status,
            "event_count": len(events),
        },
        "product_review": product_review.model_dump(mode="json") if product_review else None,
    }


def _tailored_pack_payload(generated_pack_id: str | None) -> dict[str, Any] | None:
    """The generated exam pack for a tailored run, if still in the registry.

    Generated packs live in-process, so this resolves for a bundle fetched in the
    same process as the run; after a cold restart it is simply absent.
    """
    if not generated_pack_id:
        return None
    try:
        from .exam_packs import get_exam_pack

        return get_exam_pack(generated_pack_id).model_dump(mode="json", by_alias=True)
    except Exception:
        return None


@lru_cache(maxsize=1)
def store() -> DataStore:
    backend = os.environ.get("ASSAY_DB_BACKEND", "sqlite").strip().lower() or "sqlite"
    supabase_url = os.environ.get("SUPABASE_URL", "").strip()
    supabase_key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.environ.get("SUPABASE_SECRET_KEY", "").strip()
        or os.environ.get("SUPABASE_KEY", "").strip()
    )
    if backend == "supabase":
        if not supabase_url or not supabase_key:
            raise RuntimeError("Supabase persistence requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
        return SupabaseStore(supabase_url, supabase_key)
    if backend != "sqlite":
        raise RuntimeError(f"Unsupported ASSAY_DB_BACKEND {backend!r}; use 'sqlite' or 'supabase'.")
    return SQLiteStore()


def reset_store_cache() -> None:
    store.cache_clear()


def _dump_model(model: Any) -> str:
    return json.dumps(model.model_dump(mode="json"), ensure_ascii=True)


def _with_current_tenant(model: Any) -> Any:
    tenant_id = current_tenant_id()
    if getattr(model, "tenant_id", None) == tenant_id:
        return model
    return model.model_copy(update={"tenant_id": tenant_id})


def _load_candidate(payload: str | dict[str, Any]) -> CandidateConfig:
    try:
        if isinstance(payload, str):
            return CandidateConfig.model_validate_json(payload)
        return CandidateConfig.model_validate(payload)
    except Exception:
        data = json.loads(payload) if isinstance(payload, str) else dict(payload)
        endpoint = data.get("endpoint_url")
        metadata = dict(data.get("metadata") or {})
        if endpoint:
            metadata["quarantined_endpoint_url"] = endpoint
            metadata["quarantine_reason"] = "Endpoint failed current SSRF validation on load."
            data["endpoint_url"] = None
        data["metadata"] = metadata
        return CandidateConfig.model_validate(data)
