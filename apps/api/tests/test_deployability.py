from __future__ import annotations

from assay_api.deployability import DeployabilityPolicy, evaluate_scorecard, policy_for_run
from assay_api.models import RunRecord, Scorecard, TraceAuditSummary


def _scorecard(**updates):
    base = Scorecard(
        run_id="run_unit",
        certified=True,
        k=3,
        thresholds={"competency": 0.8, "max_transfer_gap": 0.2, "tas": 70},
        simulator_model="unit",
        pass_at_k={"policy": True, "tool_use": True},
        competency_scores={"policy": 0.82, "tool_use": 0.81},
        seen_scores={"policy": 0.9, "tool_use": 0.86},
        held_out_scores={"policy": 0.82, "tool_use": 0.81},
        transfer_gap={"policy": 0.08, "tool_use": 0.05},
        grader_disagreement=0.0,
        trace_audit=TraceAuditSummary(
            status="ok",
            trace_id="trace_unit",
            tas_score=75,
            grade="Good",
            passes=True,
            total_steps=5,
            total_tokens=300,
        ),
        failure_reasons=[],
    )
    return base.model_copy(update=updates)


def test_deployability_passes_threshold_without_requiring_100() -> None:
    decision = evaluate_scorecard(_scorecard())

    assert decision.deployable is True
    assert decision.verdict == "ship"
    assert decision.metrics["mean_held_out_score"] == 0.815
    assert not decision.blocking_reasons


def test_deployability_blocks_failed_pass_at_k() -> None:
    decision = evaluate_scorecard(
        _scorecard(
            certified=False,
            pass_at_k={"policy": False},
            failure_reasons=["policy failed pass^3 on held-out variants"],
        )
    )

    assert decision.deployable is False
    assert decision.verdict == "do_not_ship"
    assert any("not score 100" in reason for reason in decision.blocking_reasons)


def test_advisory_policy_warns_on_trace_without_blocking() -> None:
    decision = evaluate_scorecard(
        _scorecard(
            certified=False,
            trace_audit=TraceAuditSummary(
                status="unavailable",
                passes=False,
                total_steps=6,
                message="TraceRazor unavailable",
            ),
        ),
        DeployabilityPolicy(name="advisory", k=3, require_trace=False),
    )

    assert decision.deployable is True
    assert decision.verdict == "probation"
    assert decision.warnings


def test_policy_for_run_overlays_run_thresholds_on_named_base() -> None:
    run = RunRecord(
        candidate_id="cand_unit",
        k=2,
        competency_threshold=0.7,
        max_transfer_gap=0.3,
        tas_threshold=60,
        policy_name="advisory",
    )

    policy = policy_for_run(run)

    assert policy.name == "advisory"
    assert policy.require_trace is False
    assert policy.allow_degraded is True
    assert policy.k == 2
    assert policy.competency_threshold == 0.7
    assert policy.max_transfer_gap == 0.3
    assert policy.tas_threshold == 60


def test_policy_for_run_explicit_name_overrides_run_policy() -> None:
    run = RunRecord(candidate_id="cand_unit", policy_name="advisory")

    policy = policy_for_run(run, "strict")

    assert policy.name == "strict"
    assert policy.require_trace is True
    # Run thresholds still overlay the named base.
    assert policy.k == run.k
    assert policy.competency_threshold == run.competency_threshold


def test_policy_for_run_defaults_to_strict_for_legacy_runs() -> None:
    run = RunRecord(candidate_id="cand_unit")

    policy = policy_for_run(run)

    assert policy.name == "strict"
    assert policy.require_trace is True
