"""Programmatic entry points for Assay.

This is the surface the MCP server, notebooks, and other Python callers use.
It wraps the same engine the CLI and HTTP API drive, with one difference in
emphasis: every result says plainly whether it came from the live behavioral
exam (a real model making real tool calls inside the sandbox) or from the
deterministic mock grader. Mock results are useful for demos and plumbing
checks; they are never a guardrail verdict, and the payload says so.

All functions are importable without a server, a database file in the repo,
or an OpenAI key. Only ``run_exam`` in live mode needs a key.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any, Literal

from .agent_formats import normalize_agent_definition
from .agent_intake import detect_agent_facts
from .agent_refinery import agent_spec_payload
from .agent_research import resolve_openai_key
from .database import (
    get_candidate,
    get_run,
    get_scorecard,
    init_db,
    list_run_summaries,
    proof_bundle,
    reset_store_cache,
    save_candidate,
    save_run,
)
from .deployability import (
    DeployabilityDecision,
    DeployabilityPolicy,
    evaluate_scorecard,
    load_default_policy,
    policy_for_run,
)
from .exam_packs import get_exam_pack, list_exam_packs
from .models import CandidateConfig, RunRecord, Scorecard
from .orchestrator import RunOrchestrator
from .static_lint import static_lint
from .tool_parser import parse_tools_from_markdown
from .trace_audit import tracerazor_doctor

ExamMode = Literal["auto", "live", "mock"]

MOCK_WARNING = (
    "Mock mode: the deterministic demo grader scored this run. No model made "
    "tool calls, so no tripwire could fire and the verdict is NOT a behavioral "
    "guardrail result. Set OPENAI_API_KEY (or pass mode='live') for the real exam."
)
TRACE_WARNING = (
    "TraceRazor is not installed, so the trace-audit gate was skipped. Install "
    "the 'trace' extra (pip install 'assay[trace]') to enable it."
)

_SDK_SOURCE = "assay-sdk"


# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #


def default_db_path() -> Path:
    """Where SDK and MCP runs are persisted when the caller does not say.

    The HTTP API defaults to a path inside the repo checkout, which is wrong for
    an installed package. The SDK honours ``ASSAY_DB_PATH`` and otherwise uses a
    per-user location.
    """
    configured = os.environ.get("ASSAY_DB_PATH", "").strip()
    if configured:
        return Path(configured).expanduser()
    base = os.environ.get("XDG_DATA_HOME", "").strip() or str(Path.home() / ".local" / "share")
    return Path(base).expanduser() / "assay" / "assay.db"


def configure(db_path: str | Path | None = None) -> Path:
    """Point the SDK at a SQLite file and initialise it. Returns the path used."""
    path = Path(db_path).expanduser() if db_path else default_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    os.environ["ASSAY_DB_PATH"] = str(path)
    os.environ.setdefault("ASSAY_DB_BACKEND", "sqlite")
    reset_store_cache()
    init_db()
    return path


def _ensure_db(db_path: str | Path | None) -> None:
    if db_path is not None:
        configure(db_path)
        return
    backend = os.environ.get("ASSAY_DB_BACKEND", "sqlite").strip().lower() or "sqlite"
    if backend == "sqlite" and not os.environ.get("ASSAY_DB_PATH", "").strip():
        configure(None)
    else:
        init_db()


def live_available() -> bool:
    """True when a model key is resolvable and live mode is not disabled."""
    return bool(resolve_openai_key())


def trace_available() -> bool:
    try:
        import tracerazor  # noqa: F401
    except Exception:
        return False
    return True


# --------------------------------------------------------------------------- #
# No-key analysis
# --------------------------------------------------------------------------- #


def lint_agent(content: str, filename: str | None = None) -> dict[str, Any]:
    """Static, deterministic analysis of an agent definition. Needs no key.

    Accepts Markdown (AGENTS.md, CLAUDE.md, .cursorrules, SKILL.md) or a
    JSON/YAML/TOML agent definition; ``filename`` helps format detection.
    """
    normalized = normalize_agent_definition(content, filename=filename)
    markdown = normalized.markdown
    facts = {**detect_agent_facts(markdown), **normalized.facts_overrides}
    tools = parse_tools_from_markdown(markdown)
    report = static_lint(markdown, tools)
    findings = [f.model_dump(mode="json") for f in report.findings]
    counts: dict[str, int] = {}
    for finding in report.findings:
        counts[finding.severity] = counts.get(finding.severity, 0) + 1
    return {
        "schema": "assay.sdk.lint.v1",
        "kind": "static_analysis",
        "behavioral": False,
        "source_format": normalized.format,
        "title": facts.get("title") or "",
        "declared_tools": [t.name for t in tools],
        "dangerous_tools": list(report.dangerous_tools),
        "guardrail_coverage": dict(report.guardrail_coverage),
        "findings": findings,
        "finding_counts": counts,
        "note": report.label,
    }


def list_packs() -> list[dict[str, Any]]:
    """Exam packs the engine can run, with item counts per competency."""
    packs = []
    for pack in list_exam_packs():
        competencies: dict[str, int] = {}
        for item in pack.items:
            competencies[item.competency] = competencies.get(item.competency, 0) + 1
        packs.append(
            {
                "id": pack.id,
                "name": pack.name,
                "simulator_model": pack.simulator_model,
                "items": len(pack.items),
                "competencies": competencies,
            }
        )
    return packs


# --------------------------------------------------------------------------- #
# The exam
# --------------------------------------------------------------------------- #


def _resolve_mode(mode: ExamMode) -> tuple[str, str | None]:
    """Return (effective_mode, error). ``auto`` picks live when a key exists."""
    if mode == "live":
        if not live_available():
            return "live", (
                "Live mode requested but no OpenAI key was found. Set OPENAI_API_KEY "
                "(or add it to a root .env), and make sure ASSAY_DISABLE_OPENAI is not set."
            )
        return "live", None
    if mode == "mock":
        return "mock", None
    return ("live" if live_available() else "mock"), None


def _policy(
    *,
    k: int,
    pass_threshold: float,
    require_trace: bool | None,
    policy_name: str | None,
) -> DeployabilityPolicy:
    policy = load_default_policy(policy_name)
    update: dict[str, Any] = {"k": k, "competency_threshold": pass_threshold}
    if require_trace is True:
        # Caller insists on the trace audit: it must be installed and pass.
        update.update(require_trace=True, require_trace_installed=True)
    elif require_trace is False:
        update.update(require_trace=False, require_trace_installed=False)
    # None: policy default. A trace that runs and fails blocks; a missing
    # TraceRazor is skipped with a warning (deployability.evaluate_scorecard).
    return policy.model_copy(update=update)


def _breaches(decision: DeployabilityDecision, scorecard: Scorecard) -> list[dict[str, Any]]:
    """Pull the behavioral breaches (tripwire hits) out of the critical findings."""
    found: list[dict[str, Any]] = []
    seen: set[str] = set()
    for text in [*decision.critical_findings, *scorecard.failure_reasons]:
        if "guardrail_breach" not in text or text in seen:
            continue
        seen.add(text)
        # Format: "CRITICAL guardrail_breach: <competency> (<variant>) - tripwire <id>: <excerpt>."
        competency = ""
        variant = ""
        tripwire = ""
        excerpt = ""
        head, _, tail = text.partition(" - tripwire ")
        if ":" in head:
            scope = head.split(":", 1)[1].strip()
            if "(" in scope and scope.endswith(")"):
                competency, variant = scope[:-1].split("(", 1)
                competency = competency.strip()
                variant = variant.strip()
            else:
                competency = scope
        if tail:
            tripwire, _, excerpt = tail.partition(":")
            excerpt = excerpt.strip().rstrip(".")
        found.append(
            {
                "competency": competency,
                "variant": variant,
                "tripwire": tripwire.strip(),
                "tool_call": excerpt,
                "raw": text,
            }
        )
    return found


def _summarise(
    run: RunRecord,
    candidate: CandidateConfig,
    scorecard: Scorecard,
    decision: DeployabilityDecision,
    *,
    mode: str,
    warnings: list[str],
) -> dict[str, Any]:
    privilege = scorecard.privilege_delta.model_dump(mode="json") if scorecard.privilege_delta else None
    behavioral = mode == "live"
    return {
        "schema": "assay.sdk.exam_result.v1",
        "run_id": run.id,
        "candidate_id": candidate.id,
        "candidate_name": candidate.name,
        "exam_pack_id": run.exam_pack_id,
        "mode": mode,
        "behavioral": behavioral,
        # What was actually exercised: the definition, played by this model,
        # with the tools it declares. Not the caller's production runtime.
        "exercised_model": scorecard.simulator_model,
        "tested": (
            "the agent definition, reconstructed with its declared tools and played by "
            f"{scorecard.simulator_model} inside a simulated sandbox"
            if behavioral
            else "nothing behavioral: the deterministic mock grader scored canned answers"
        ),
        # The gate itself returns "unverified" for a non-behavioral run, so the
        # SDK no longer needs its own label: every surface says the same thing.
        "verdict": decision.verdict,
        "label": decision.label,
        "deployable": decision.deployable,
        "summary": decision.summary,
        "k": scorecard.k,
        "trials_stochastic": scorecard.trials_stochastic,
        "certified": scorecard.certified,
        "metrics": decision.metrics,
        "held_out_scores": scorecard.held_out_scores,
        "seen_scores": scorecard.seen_scores,
        "breaches": _breaches(decision, scorecard),
        "critical_findings": list(decision.critical_findings),
        "blocking_reasons": list(decision.blocking_reasons),
        "failure_reasons": list(scorecard.failure_reasons),
        "privilege_delta": privilege,
        "trace_audit": {
            "status": scorecard.trace_audit.status,
            "tas_score": scorecard.trace_audit.tas_score,
            "passes": scorecard.trace_audit.passes,
        },
        "warnings": warnings,
    }


async def run_exam_async(
    content: str,
    filename: str | None = None,
    *,
    pack: str = "guardrail-v1",
    k: int = 1,
    pass_threshold: float = 0.8,
    mode: ExamMode = "auto",
    model: str | None = None,
    require_trace: bool | None = None,
    policy: str | None = None,
    agent_name: str | None = None,
    db_path: str | Path | None = None,
) -> dict[str, Any]:
    """Run the adversarial exam against an agent definition and return a summary.

    What is tested is the definition, reconstructed with its declared tools and
    played by a reference model (``model``, else ``ASSAY_OPENAI_MODEL``, else the
    adapter default) inside the simulated sandbox. The result names that model
    in ``exercised_model``. It is not a test of the caller's production runtime.

    ``mode="auto"`` runs live when an OpenAI key is available and falls back to
    the mock grader otherwise. ``mode="live"`` fails fast without a key.
    ``require_trace``: ``True`` means TraceRazor must be installed and pass;
    ``False`` makes it advisory; ``None`` (default) blocks only on a trace that
    ran and failed, and skips with a warning when TraceRazor is not installed.
    """
    if not 1 <= k <= 8:
        raise ValueError("k must be between 1 and 8")
    if not 0 <= pass_threshold <= 1:
        raise ValueError("pass_threshold must be between 0 and 1")
    effective_mode, error = _resolve_mode(mode)
    if error:
        raise RuntimeError(error)

    _ensure_db(db_path)
    exam_pack = get_exam_pack(pack)  # raises KeyError for unknown packs
    policy_obj = _policy(k=k, pass_threshold=pass_threshold, require_trace=require_trace, policy_name=policy)

    normalized = normalize_agent_definition(content, filename=filename)
    markdown = normalized.markdown
    facts = {**detect_agent_facts(markdown), **normalized.facts_overrides}
    candidate = save_candidate(
        CandidateConfig(
            name=agent_name or facts.get("title") or (Path(filename).stem if filename else "agent"),
            adapter_type="openai-compatible" if effective_mode == "live" else "mock",
            model=model or None,
            system_prompt=markdown,
            tools=parse_tools_from_markdown(markdown),
            metadata={
                "source": _SDK_SOURCE,
                "source_format": normalized.format,
                "filename": filename or "",
                **facts,
            },
        )
    )
    run = save_run(
        RunRecord(
            candidate_id=candidate.id,
            exam_pack_id=exam_pack.id,
            k=policy_obj.k,
            competency_threshold=policy_obj.competency_threshold,
            max_transfer_gap=policy_obj.max_transfer_gap,
            tas_threshold=policy_obj.tas_threshold,
            policy_name=policy_obj.name,
        )
    )
    scorecard = await RunOrchestrator().start(run, candidate)
    decision = evaluate_scorecard(scorecard, policy_obj)

    warnings: list[str] = []
    if effective_mode == "mock":
        warnings.append(MOCK_WARNING)
    if not trace_available():
        warnings.append(TRACE_WARNING)
    if scorecard.degraded and scorecard.degraded_reason:
        warnings.append(f"Degraded run: {scorecard.degraded_reason}")
    return _summarise(run, candidate, scorecard, decision, mode=effective_mode, warnings=warnings)


def run_exam(content: str, filename: str | None = None, **kwargs: Any) -> dict[str, Any]:
    """Synchronous wrapper around :func:`run_exam_async`."""
    return asyncio.run(run_exam_async(content, filename, **kwargs))


# --------------------------------------------------------------------------- #
# Stored runs
# --------------------------------------------------------------------------- #


def get_run_result(run_id: str, *, db_path: str | Path | None = None) -> dict[str, Any] | None:
    """Re-derive the summary for a stored run, or ``None`` if unknown."""
    _ensure_db(db_path)
    run = get_run(run_id)
    if run is None:
        return None
    candidate = get_candidate(run.candidate_id)
    scorecard = get_scorecard(run_id)
    if candidate is None or scorecard is None:
        return {
            "schema": "assay.sdk.exam_result.v1",
            "run_id": run.id,
            "status": run.status,
            "error": run.error,
            "summary": "Run has no scorecard yet.",
        }
    decision = evaluate_scorecard(scorecard, policy_for_run(run))
    mode = "mock" if candidate.adapter_type == "mock" else "live"
    warnings = [MOCK_WARNING] if mode == "mock" else []
    return _summarise(run, candidate, scorecard, decision, mode=mode, warnings=warnings)


def list_runs(limit: int = 20, offset: int = 0, *, db_path: str | Path | None = None) -> dict[str, Any]:
    """Page through stored runs, newest first."""
    _ensure_db(db_path)
    summaries = list_run_summaries()
    total = len(summaries)
    page = summaries[offset : offset + limit]
    return {
        "total": total,
        "count": len(page),
        "offset": offset,
        "has_more": offset + len(page) < total,
        "next_offset": offset + len(page) if offset + len(page) < total else None,
        "items": page,
    }


def refine_agent(run_id: str, *, db_path: str | Path | None = None) -> dict[str, Any] | None:
    """The refined agent definition (``assay.agent_spec.v1``) for a run."""
    _ensure_db(db_path)
    try:
        return agent_spec_payload(run_id)
    except KeyError:
        return None


def get_proof_bundle(run_id: str, *, include_events: bool = False, db_path: str | Path | None = None) -> dict[str, Any] | None:
    """The portable proof bundle (run, candidate, scorecard, optional spans)."""
    _ensure_db(db_path)
    return proof_bundle(run_id, include_events=include_events)


def doctor(*, db_path: str | Path | None = None) -> dict[str, Any]:
    """Report what this installation can and cannot do."""
    path = Path(db_path).expanduser() if db_path else default_db_path()
    trace = trace_available()
    return {
        "schema": "assay.sdk.doctor.v1",
        "live_exam_available": live_available(),
        "openai_disabled": os.environ.get("ASSAY_DISABLE_OPENAI", "0").strip() == "1",
        "tracerazor_installed": trace,
        "tracerazor": tracerazor_doctor() if trace else {"status": "unavailable"},
        "database_backend": os.environ.get("ASSAY_DB_BACKEND", "sqlite"),
        "database_path": str(path),
        "packs": [p["id"] for p in list_packs()],
    }


__all__ = [
    "MOCK_WARNING",
    "TRACE_WARNING",
    "configure",
    "default_db_path",
    "doctor",
    "get_proof_bundle",
    "get_run_result",
    "lint_agent",
    "list_packs",
    "list_runs",
    "live_available",
    "refine_agent",
    "run_exam",
    "run_exam_async",
    "trace_available",
]
