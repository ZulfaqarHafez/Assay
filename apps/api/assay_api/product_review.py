from __future__ import annotations

from typing import Any

from .database import database_health, get_run, get_scorecard, list_events
from .deployability import evaluate_scorecard
from .models import ProductReview, ProductReviewer, Scorecard


def product_review_for_run(run_id: str) -> ProductReview | None:
    run = get_run(run_id)
    if run is None:
        return None
    scorecard = get_scorecard(run_id)
    events = list_events(run_id)
    try:
        db = database_health()
    except Exception as exc:
        db = {"ok": False, "backend": "unknown", "error": str(exc)}

    return ProductReview(
        run_id=run_id,
        reviewers=[
            _role_analyst(scorecard),
            _security_interviewer(scorecard),
            _tool_auditor(scorecard, len(events)),
            _trace_auditor(scorecard, db),
            _release_manager(scorecard, len(events)),
        ],
    )


def _role_analyst(scorecard: Scorecard | None) -> ProductReviewer:
    if scorecard is None:
        return ProductReviewer(
            key="role_analyst",
            name="Role Analyst",
            status="wait",
            label="ready",
            summary="Waiting to qualify what this agent is supposed to do.",
            evidence=["No scorecard has been created yet."],
            next_step="Run an interview loop to qualify the role and exam pack.",
            sprite="candidate-document",
        )
    if scorecard.qualification_status == "tailored":
        return ProductReviewer(
            key="role_analyst",
            name="Role Analyst",
            status="pass",
            label="qualified",
            summary="The judge was qualified against a role-specific brief before scoring.",
            evidence=[
                scorecard.role_brief_summary or "Tailored role brief was used.",
                f"Qualification mode: {scorecard.qualification_status}.",
            ],
            sprite="candidate-document",
        )
    return ProductReviewer(
        key="role_analyst",
        name="Role Analyst",
        status="warn",
        label=scorecard.qualification_status,
        summary="The run used deterministic role qualification; acceptable offline, weaker than researched loops.",
        evidence=[scorecard.role_brief_summary or "No role-specific researched brief was recorded."],
        next_step="Use `assay research-role --research fast|deep` for a stronger interview loop.",
        sprite="candidate-review",
    )


def _security_interviewer(scorecard: Scorecard | None) -> ProductReviewer:
    if scorecard is None:
        return ProductReviewer(
            key="security_interviewer",
            name="Security Interviewer",
            status="wait",
            label="waiting",
            summary="Waiting for adversarial interview evidence.",
            evidence=["No scorecard has been created yet."],
            next_step="Run an interview loop with adversarial rounds.",
            sprite="candidate-alert",
        )
    failures = [
        reason
        for reason in scorecard.failure_reasons
        if any(term in reason.lower() for term in ("injection", "protected", "privacy", "refusal", "fairness"))
    ]
    if failures:
        return ProductReviewer(
            key="security_interviewer",
            name="Security Interviewer",
            status="warn",
            label="blocked",
            summary="Security or policy interview rounds found deploy-blocking behavior.",
            evidence=failures[:3],
            next_step="Patch the agent rules, rerun held-out variants, and compare before shipping.",
            sprite="candidate-alert",
        )
    return ProductReviewer(
        key="security_interviewer",
        name="Security Interviewer",
        status="pass",
        label="clear",
        summary="No security hard-fail reason was recorded in the scorecard.",
        evidence=["Prompt-injection, privacy, fairness, and refusal rounds did not block deployability."],
        sprite="candidate-shield",
    )


def _tool_auditor(scorecard: Scorecard | None, event_count: int) -> ProductReviewer:
    if scorecard is None:
        return ProductReviewer(
            key="tool_auditor",
            name="Tool Auditor",
            status="wait",
            label="waiting",
            summary="Waiting for tool-call and event evidence.",
            evidence=["No completed run is available yet."],
            next_step="Run an interview loop to capture candidate and tool events.",
            sprite="candidate-audit",
        )
    toolish_failures = [
        reason
        for reason in scorecard.failure_reasons
        if any(term in reason.lower() for term in ("tool", "agency", "mutation", "transfer"))
    ]
    if toolish_failures:
        return ProductReviewer(
            key="tool_auditor",
            name="Tool Auditor",
            status="warn",
            label="review",
            summary="Tool, transfer, or excessive-agency findings need review.",
            evidence=toolish_failures[:3],
            next_step="Validate allowed tools, schemas, and side-effect approval rules.",
            sprite="candidate-approved",
        )
    return ProductReviewer(
        key="tool_auditor",
        name="Tool Auditor",
        status="pass",
        label="clean",
        summary="Tool discipline did not introduce a blocking finding.",
        evidence=[f"{event_count} ordered run events are available for audit."],
        sprite="candidate-approved",
    )


def _trace_auditor(scorecard: Scorecard | None, db: dict[str, Any]) -> ProductReviewer:
    trace = scorecard.trace_audit if scorecard else None
    if not db.get("ok", False):
        return ProductReviewer(
            key="tracerazor_auditor",
            name="TraceRazor Auditor",
            status="warn",
            label="storage",
            summary="Database health needs attention before persisted proof can be trusted.",
            evidence=[str(db.get("error") or "Database health returned not ok.")],
            next_step="Check the API database configuration before relying on persisted runs.",
            sprite="candidate-alert",
        )
    if trace is None:
        return ProductReviewer(
            key="tracerazor_auditor",
            name="TraceRazor Auditor",
            status="wait",
            label="waiting",
            summary="Waiting for trace audit evidence.",
            evidence=["No scorecard has been created yet."],
            next_step="Run an interview loop to capture trace steps.",
            sprite="candidate-audit",
        )
    if trace.status != "ok":
        return ProductReviewer(
            key="tracerazor_auditor",
            name="TraceRazor Auditor",
            status="warn",
            label=trace.status,
            summary="TraceRazor needs attention before strict certification.",
            evidence=[trace.message or f"TraceRazor status is {trace.status}."],
            next_step="Run `assay doctor` and capture at least five candidate trace steps.",
            sprite="candidate-alert",
        )
    if not trace.passes:
        return ProductReviewer(
            key="tracerazor_auditor",
            name="TraceRazor Auditor",
            status="warn",
            label="tas",
            summary="TraceRazor found inefficient or low-value trajectory behavior.",
            evidence=[f"TraceRazor TAS {trace.tas_score:.1f} did not pass."],
            next_step="Apply TraceRazor fixes, rerun, and compare TAS before shipping.",
            sprite="candidate-alert",
        )
    return ProductReviewer(
        key="tracerazor_auditor",
        name="TraceRazor Auditor",
        status="pass",
        label="passed",
        summary="TraceRazor audit supports the run evidence.",
        evidence=[f"TraceRazor TAS {trace.tas_score:.1f}.", f"Storage backend: {db.get('backend', 'unknown')}."],
        sprite="candidate-approved",
    )


def _release_manager(scorecard: Scorecard | None, event_count: int) -> ProductReviewer:
    if scorecard is None:
        return ProductReviewer(
            key="release_manager",
            name="Release Manager",
            status="wait",
            label="waiting",
            summary="Waiting for the deployability decision.",
            evidence=["No scorecard has been created yet."],
            next_step="Run an interview loop and gate it with strict policy.",
            sprite="candidate-document",
        )
    decision = evaluate_scorecard(scorecard)
    if decision.deployable:
        return ProductReviewer(
            key="release_manager",
            name="Release Manager",
            status="pass" if decision.verdict == "ship" else "warn",
            label=decision.label.lower(),
            summary=decision.summary,
            evidence=[
                f"{len(decision.passed_checks)} policy checks passed.",
                f"{event_count} proof events persisted.",
            ],
            next_step="Export the proof bundle and attach it to the release record." if decision.verdict == "ship" else "Review advisory findings before production.",
            sprite="candidate-approved",
        )
    return ProductReviewer(
        key="release_manager",
        name="Release Manager",
        status="warn",
        label="blocked",
        summary=decision.summary,
        evidence=decision.blocking_reasons[:3] or ["Deployability policy blocked this run."],
        next_step="Improve the agent, rerun the interview loop, then compare against this baseline.",
        sprite="candidate-review",
    )
