from __future__ import annotations

from assay_api.models import RunRecord, Scorecard, TraceAuditSummary
from assay_api.product_review import product_review_for_run


def test_product_review_reuses_preloaded_run_evidence(monkeypatch) -> None:
    run = RunRecord(id="run_review", candidate_id="cand_review", exam_pack_id="hr-v1")
    scorecard = Scorecard(
        run_id=run.id,
        certified=True,
        k=3,
        thresholds={"competency": 0.8, "max_transfer_gap": 0.2, "tas": 70},
        simulator_model="assay-deterministic-sim-v1",
        pass_at_k={"compliance": True},
        competency_scores={"compliance": 0.95},
        seen_scores={"compliance": 0.95},
        held_out_scores={"compliance": 0.95},
        transfer_gap={"compliance": 0.0},
        grader_disagreement=0.02,
        trace_audit=TraceAuditSummary(
            status="ok",
            trace_id="trace_review",
            tas_score=91,
            grade="Excellent",
            passes=True,
        ),
    )

    def fail_db_call(*_args, **_kwargs):
        raise AssertionError("preloaded product review should not hit the database")

    monkeypatch.setattr("assay_api.product_review.get_run", fail_db_call)
    monkeypatch.setattr("assay_api.product_review.get_scorecard", fail_db_call)
    monkeypatch.setattr("assay_api.product_review.list_events", fail_db_call)
    monkeypatch.setattr("assay_api.product_review.database_health", fail_db_call)

    review = product_review_for_run(
        run.id,
        db_health={"ok": True, "backend": "preloaded"},
        run_record=run,
        scorecard=scorecard,
        events=[],
    )

    assert review is not None
    assert review.run_id == run.id
    assert [reviewer.key for reviewer in review.reviewers] == [
        "role_analyst",
        "security_interviewer",
        "tool_auditor",
        "tracerazor_auditor",
        "release_manager",
    ]
