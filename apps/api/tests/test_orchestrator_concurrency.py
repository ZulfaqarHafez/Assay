from __future__ import annotations

import asyncio

import pytest

from assay_api import orchestrator as orch
from assay_api.models import (
    CandidateConfig,
    CandidateResponse,
    ExamItem,
    ExpectedCheck,
    RunRecord,
    TokenCounts,
    TraceAuditSummary,
)
from assay_api.scoring import GradeResult


class _FakeAudit:
    def __init__(self, threshold: float):
        self.threshold = threshold

    def analyse(self, candidate, trace_steps, task_value_score):
        return TraceAuditSummary(status="ok", trace_id="t", tas_score=88, grade="Good",
                                 passes=True, total_steps=len(trace_steps), total_tokens=100)


class _CountingAdapter:
    """Records peak concurrent ask() calls so we can prove items run in parallel."""

    def __init__(self) -> None:
        self.current = 0
        self.peak = 0

    async def ask(self, context: str, question: str, trial: int = 1) -> CandidateResponse:
        self.current += 1
        self.peak = max(self.peak, self.current)
        await asyncio.sleep(0.02)  # hold the slot so overlap is observable
        self.current -= 1
        return CandidateResponse(
            answer="Use job-related skills criteria; refuse protected traits; redact; escalate; untrusted input.",
            tokens=TokenCounts(total=12),
        )

    async def aclose(self) -> None:
        return None


@pytest.mark.asyncio
async def test_run_items_execute_concurrently(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSAY_RUN_CONCURRENCY", "10")
    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", _FakeAudit)
    from assay_api.database import init_db
    init_db()
    adapter = _CountingAdapter()
    monkeypatch.setattr(orch, "adapter_for", lambda candidate: adapter)

    run = RunRecord(candidate_id="c", exam_pack_id="hr-v1", k=1)  # 5 items x 2 variants = 10 asks
    candidate = CandidateConfig(id="c", name="x", adapter_type="mock")
    scorecard = await orch.RunOrchestrator().start(run, candidate)

    # Seen and held-out variants run as independent bounded units. The older
    # per-item scheduler could only peak at 5 asks here.
    assert adapter.peak >= 8
    assert scorecard.run_id == run.id
    assert scorecard.competency_scores


@pytest.mark.asyncio
async def test_run_concurrency_one_is_sequential(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSAY_RUN_CONCURRENCY", "1")
    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", _FakeAudit)
    from assay_api.database import init_db
    init_db()
    adapter = _CountingAdapter()
    monkeypatch.setattr(orch, "adapter_for", lambda candidate: adapter)

    run = RunRecord(candidate_id="c", exam_pack_id="hr-v1", k=1)
    candidate = CandidateConfig(id="c", name="x", adapter_type="mock")
    await orch.RunOrchestrator().start(run, candidate)

    assert adapter.peak == 1  # concurrency=1 restores fully-sequential behavior


def test_grade_uses_supplied_exam_item_without_pack_lookup(monkeypatch: pytest.MonkeyPatch) -> None:
    item = ExamItem(
        id="custom-only",
        competency="custom_logic",
        prompt="Seen?",
        held_out_prompt="Held?",
        rubric="Answer safely.",
        expected_checks=[
            ExpectedCheck(
                id="safe",
                label="Safe",
                keywords=["safe"],
                forbidden=[],
                weight=1.0,
            )
        ],
    )
    run = RunRecord(candidate_id="cand_x", exam_pack_id="missing-pack")
    response = CandidateResponse(answer="safe answer", tokens=TokenCounts(total=1))
    seen: list[ExamItem] = []

    def fake_grade(received_item, received_response, threshold, **kwargs):
        seen.append(received_item)
        assert received_response == response
        assert threshold == 0.8
        return GradeResult(
            score=1.0,
            passed=True,
            panel_scores={"rubric": 1.0},
            matched_checks=["safe"],
            missed_checks=[],
            forbidden_hits=[],
            feedback="ok",
            judge=None,
        )

    monkeypatch.setattr(orch, "grade_response", fake_grade)
    runner = orch.RunOrchestrator()
    monkeypatch.setattr(runner._recorder, "event", lambda *args, **kwargs: None)

    result = runner._grade(run, item, item.competency, "seen", 1, response, 0.8)

    assert result.passed is True
    assert seen == [item]
