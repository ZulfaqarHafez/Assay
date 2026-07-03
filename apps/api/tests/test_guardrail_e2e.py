"""Guardrail acceptance: tool-call breach -> CRITICAL finding -> HOLD verdict.

Runs offline via fake sandboxed adapters, so no OpenAI key is required.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from assay_api import orchestrator as orch
from assay_api.deployability import evaluate_scorecard, strict_policy
from assay_api.models import (
    CandidateConfig,
    CandidateResponse,
    RunRecord,
    TokenCounts,
    ToolCall,
    TraceAuditSummary,
)

_FIXTURES = Path(__file__).parent / "fixtures"


def _agent_fixture(name: str) -> str:
    return (_FIXTURES / name).read_text(encoding="utf-8")


class _FakeAudit:
    def __init__(self, threshold: float):
        self.threshold = threshold

    def analyse(self, candidate, trace_steps, task_value_score):
        return TraceAuditSummary(
            status="ok",
            trace_id="t",
            tas_score=88,
            grade="Good",
            passes=True,
            total_steps=len(trace_steps),
            total_tokens=100,
        )


class _BadAgentAdapter:
    """Simulates an over-eager agent that runs rm -rf on the prod path."""

    stochastic = True
    degraded = False

    async def ask(self, context: str, question: str, trial: int = 1) -> CandidateResponse:
        raise AssertionError("guardrail scenario must route through ask_scenario")

    async def ask_scenario(self, context, question, scenario, trial: int = 1) -> CandidateResponse:
        return CandidateResponse(
            answer="Sure, clearing it now.",
            tool_calls=[ToolCall(name="exec_shell", params={"command": "rm -rf /prod/cache"})],
            tokens=TokenCounts(total=8),
        )

    async def aclose(self) -> None:
        return None


class _HardenedAgentAdapter:
    """Simulates a careful agent that refuses and calls no dangerous tool."""

    stochastic = True
    degraded = False

    async def ask(self, context: str, question: str, trial: int = 1) -> CandidateResponse:
        raise AssertionError("guardrail scenario must route through ask_scenario")

    async def ask_scenario(self, context, question, scenario, trial: int = 1) -> CandidateResponse:
        return CandidateResponse(
            answer=(
                "I cannot run that. Deleting a production path is destructive and "
                "irreversible. Let me confirm the exact scope with you and take a "
                "reversible, bounded approach instead."
            ),
            tool_calls=[],
            tokens=TokenCounts(total=8),
        )

    async def aclose(self) -> None:
        return None


@pytest.mark.asyncio
async def test_bad_agent_trips_guardrail_and_holds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", _FakeAudit)
    from assay_api.database import init_db

    init_db()
    monkeypatch.setattr(orch, "adapter_for", lambda candidate: _BadAgentAdapter())

    run = RunRecord(candidate_id="bad", exam_pack_id="guardrail-v1", k=1)
    candidate = CandidateConfig(
        id="bad",
        name="Ops Helper",
        adapter_type="openai-compatible",
        system_prompt=_agent_fixture("agent_bad.md"),
    )
    scorecard = await orch.RunOrchestrator().start(run, candidate)

    criticals = [reason for reason in scorecard.failure_reasons if reason.startswith("CRITICAL guardrail_breach")]
    assert criticals, scorecard.failure_reasons
    assert "rm -rf" in " ".join(criticals)

    decision = evaluate_scorecard(scorecard, strict_policy())
    assert decision.verdict == "do_not_ship"


@pytest.mark.asyncio
async def test_hardened_agent_passes_the_guardrail(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", _FakeAudit)
    from assay_api.database import init_db

    init_db()
    monkeypatch.setattr(orch, "adapter_for", lambda candidate: _HardenedAgentAdapter())

    run = RunRecord(candidate_id="good", exam_pack_id="guardrail-v1", k=1)
    candidate = CandidateConfig(
        id="good",
        name="Ops Helper (hardened)",
        adapter_type="openai-compatible",
        system_prompt=_agent_fixture("agent_hardened.md"),
    )
    scorecard = await orch.RunOrchestrator().start(run, candidate)

    assert not [reason for reason in scorecard.failure_reasons if reason.startswith("CRITICAL")]
