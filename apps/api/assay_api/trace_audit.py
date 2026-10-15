from __future__ import annotations

import os
import sys
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from pathlib import Path
from typing import Any
from uuid import uuid4

from .models import CandidateConfig, TraceAuditSummary


def _local_tracerazor_checkout() -> str:
    """A TraceRazor source checkout to import from when the package is not installed.

    ``TRACERAZOR_REPO`` wins; otherwise a ``TraceRazor`` / ``tracerazor`` folder
    next to this repository. Empty when neither exists (the installed package,
    if any, is used either way).
    """
    explicit = os.environ.get("TRACERAZOR_REPO", "").strip()
    if explicit:
        return explicit
    repo_root = Path(__file__).resolve().parents[3]
    for name in ("TraceRazor", "tracerazor"):
        candidate = repo_root.parent / name
        if (candidate / "tracerazor" / "__init__.py").is_file():
            return str(candidate)
    return ""


LOCAL_TRACERAZOR = _local_tracerazor_checkout()


class TraceAuditService:
    DEFAULT_MAX_AUDIT_STEPS = 8

    def __init__(self, threshold: float):
        self.threshold = threshold
        self.timeout_s = float(os.environ.get("ASSAY_TRACERAZOR_TIMEOUT_S", "20"))
        self.max_audit_steps = int(os.environ.get("ASSAY_TRACERAZOR_MAX_STEPS", str(self.DEFAULT_MAX_AUDIT_STEPS)))

    def analyse(
        self,
        candidate: CandidateConfig,
        trace_steps: list[dict[str, Any]],
        task_value_score: float,
    ) -> TraceAuditSummary:
        source_step_count = len(trace_steps)
        if source_step_count < 5:
            return TraceAuditSummary(
                status="insufficient_steps",
                total_steps=source_step_count,
                passes=False,
                message="TraceRazor requires at least 5 candidate steps for this audit.",
            )

        client_cls = _load_tracerazor_client()
        if client_cls is None:
            return TraceAuditSummary(
                status="unavailable",
                total_steps=source_step_count,
                passes=False,
                message="TraceRazor is not importable. Install the local checkout or tracerazor>=1.0.3.",
            )

        audit_steps = _audit_slice(trace_steps, self.max_audit_steps)
        trace = {
            "trace_id": f"assay_{uuid4().hex[:12]}",
            "agent_name": candidate.name,
            "framework": candidate.adapter_type,
            "task_value_score": max(0.0, min(1.0, task_value_score)),
            "steps": audit_steps,
            "metadata": {
                "source_steps": source_step_count,
                "audited_steps": len(audit_steps),
                "sampling": "representative" if len(audit_steps) < source_step_count else "full",
            },
        }
        try:
            report_payload = (
                _analyse_real_client_with_timeout(client_cls, self.threshold, trace, self.timeout_s)
                if str(getattr(client_cls, "__module__", "")).startswith("tracerazor")
                else _report_payload(client_cls(threshold=self.threshold).analyse(trace))
            )
        except Exception as exc:  # TraceRazor can fail if its CLI is not present.
            return TraceAuditSummary(
                status="error",
                total_steps=source_step_count,
                passes=False,
                raw={"assay_audit": trace["metadata"]},
                message=str(exc),
            )

        raw = dict(report_payload["raw"] or {})
        raw.setdefault("assay_audit", trace["metadata"])
        return TraceAuditSummary(
            status="ok",
            trace_id=report_payload["trace_id"],
            tas_score=report_payload["tas_score"],
            grade=report_payload["grade"],
            passes=report_payload["passes"],
            total_steps=source_step_count,
            total_tokens=report_payload["total_tokens"],
            metrics=report_payload["metrics"],
            savings=report_payload["savings"],
            fixes=report_payload["fixes"],
            raw=raw,
        )


def tracerazor_doctor(threshold: float = 70) -> dict[str, Any]:
    """Run an end-to-end synthetic TraceRazor audit for CLI/API diagnostics."""

    client_cls = _load_tracerazor_client()
    installed = client_cls is not None
    # Config placeholder only: the doctor audits a synthetic trace, no model is called.
    candidate = CandidateConfig(name="TraceRazor doctor", adapter_type="openai-compatible")
    steps = [
        {
            "id": index + 1,
            "type": "reasoning" if index % 2 == 0 else "tool_call",
            "content": (
                "Inspect candidate answer, compare against held-out rubric, "
                "record policy-safe evidence, and avoid leaking canaries."
            ),
            "tokens": 80 + index,
            "metadata": {
                "competency": "doctor_trace",
                "variant": "held_out" if index % 2 else "seen",
            },
        }
        for index in range(5)
    ]
    summary = TraceAuditService(threshold=threshold).analyse(
        candidate=candidate,
        trace_steps=steps,
        task_value_score=0.92,
    )
    if not installed:
        status = "missing"
        next_step = "Install tracerazor>=1.0.3 or set TRACERAZOR_REPO to a local checkout."
    elif summary.status == "ok":
        # The doctor trace is intentionally wasteful (five near-identical
        # steps) so it exercises fix generation; a low TAS here is expected
        # and means the audit engine is fully operational.
        status = "passed"
        score = f"{summary.tas_score:.1f}" if summary.tas_score is not None else "n/a"
        next_step = (
            f"TraceRazor is operational (synthetic audit returned TAS {score}/100; "
            "the doctor trace is intentionally wasteful, so a low score is expected)."
        )
    elif summary.status == "insufficient_steps":
        status = "insufficient_steps"
        next_step = "Capture at least five candidate reasoning/tool steps before audit."
    elif summary.status == "error":
        status = "failed"
        next_step = "Check TraceRazor install, timeout, and native dependencies."
    else:
        status = "warning"
        next_step = "TraceRazor is importable but did not complete the synthetic audit."
    return {
        "schema": "assay.tracerazor_doctor.v1",
        "installed": installed,
        "status": status,
        "next_step": next_step,
        "binary": os.environ.get("TRACERAZOR_BIN"),
        "summary": summary.model_dump(mode="json"),
    }


def _ensure_tracerazor_bin() -> None:
    """Point TraceRazor at the source checkout's Rust binary when available.

    Older tracerazor releases resolve `tracerazor` from PATH, which can hit
    the pip console-script launcher (a Python wrapper that adds a full
    interpreter boot per audit) instead of the Rust binary. Setting
    TRACERAZOR_BIN short-circuits detection everywhere. No-op when the env
    var is already set or no local build exists (e.g. CI).
    """
    if os.environ.get("TRACERAZOR_BIN"):
        return
    for name in ("tracerazor.exe", "tracerazor"):
        candidate = os.path.join(LOCAL_TRACERAZOR, "target", "release", name)
        if os.path.isfile(candidate):
            os.environ["TRACERAZOR_BIN"] = candidate
            return


def _load_tracerazor_client() -> Any | None:
    _ensure_tracerazor_bin()
    try:
        from tracerazor import TraceRazorClient

        return TraceRazorClient
    except Exception:
        if LOCAL_TRACERAZOR and os.path.isdir(LOCAL_TRACERAZOR) and LOCAL_TRACERAZOR not in sys.path:
            sys.path.insert(0, LOCAL_TRACERAZOR)
        try:
            from tracerazor import TraceRazorClient

            return TraceRazorClient
        except Exception:
            return None


def _make_client(client_cls: Any, threshold: float, timeout_s: float) -> tuple[Any, bool]:
    """Instantiate the client, passing the timeout through when supported.

    Returns (client, client_bounded): client_bounded is True when the client
    enforces the timeout itself. TraceRazor 1.1+ names the argument
    ``timeout_s``; 1.0.4 called it ``timeout``; older clients take neither.
    """
    for keyword in ("timeout_s", "timeout"):
        try:
            return client_cls(threshold=threshold, **{keyword: timeout_s}), True
        except TypeError:
            continue
    return client_cls(threshold=threshold), False


def _analyse_real_client_with_timeout(
    client_cls: Any, threshold: float, trace: dict[str, Any], timeout_s: float
) -> dict[str, Any]:
    """Guard the audit with a thread-based timeout.

    The tracerazor client already bounds the Rust binary subprocess, so the
    thread is only a backstop. A spawn-based process guard here would
    re-import the whole app per audit — several seconds on Windows — which
    used to eat most of the timeout budget before the audit even started.
    """
    client, client_bounded = _make_client(client_cls, threshold, timeout_s)
    guard_s = timeout_s + 2.0 if client_bounded else timeout_s
    pool = ThreadPoolExecutor(max_workers=1)
    try:
        future = pool.submit(client.analyse, trace)
        try:
            report = future.result(timeout=guard_s)
        except FuturesTimeoutError as exc:
            raise TimeoutError(f"TraceRazor audit timed out after {timeout_s:.1f}s.") from exc
        return _report_payload(report)
    finally:
        pool.shutdown(wait=False, cancel_futures=True)


def _audit_slice(trace_steps: list[dict[str, Any]], max_steps: int) -> list[dict[str, Any]]:
    """Return a bounded, ordered, representative candidate trace.

    Assay stores every span, but repeated pass^k variants can produce many
    near-identical candidate steps. TraceRazor only needs enough candidate-only
    reasoning/tool material to score adequacy, so keep a balanced slice while
    avoiding local binary timeouts on routine demos.
    """
    if max_steps <= 0 or len(trace_steps) <= max_steps:
        return trace_steps

    chosen: dict[int, dict[str, Any]] = {}

    def add(index: int) -> None:
        if 0 <= index < len(trace_steps):
            chosen[index] = trace_steps[index]

    # Preserve startup context and final behavior.
    for index in range(min(4, len(trace_steps))):
        add(index)
    for index in range(max(0, len(trace_steps) - 4), len(trace_steps)):
        add(index)

    # Cover each competency/variant pair when metadata is present.
    seen_keys: set[tuple[str, str, str]] = set()
    for index, step in enumerate(trace_steps):
        metadata = step.get("metadata") if isinstance(step, dict) else {}
        if not isinstance(metadata, dict):
            metadata = {}
        key = (
            str(metadata.get("competency", "")),
            str(metadata.get("variant", "")),
            str(step.get("type", "")),
        )
        if key not in seen_keys:
            seen_keys.add(key)
            add(index)
        if len(chosen) >= max_steps:
            break

    # Fill remaining slots evenly through the trace.
    remaining = max_steps - len(chosen)
    if remaining > 0:
        stride = max(1, len(trace_steps) // remaining)
        for index in range(0, len(trace_steps), stride):
            add(index)
            if len(chosen) >= max_steps:
                break
    if len(chosen) < max_steps:
        for index in range(len(trace_steps)):
            add(index)
            if len(chosen) >= max_steps:
                break

    return [trace_steps[index] for index in sorted(chosen)[:max_steps]]


def _report_payload(report: Any) -> dict[str, Any]:
    return {
        "trace_id": report.trace_id,
        "tas_score": report.tas_score,
        "grade": report.grade,
        "passes": report.passes,
        "total_steps": report.total_steps,
        "total_tokens": report.total_tokens,
        "metrics": report.metrics,
        "savings": report.savings,
        "fixes": report.fixes,
        "raw": report.raw,
    }
