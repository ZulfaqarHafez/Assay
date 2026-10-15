"""The programmatic SDK: honest mode reporting, breaches, and stored runs."""

from __future__ import annotations

from pathlib import Path

import pytest

from assay_api import orchestrator as orch
from assay_api import sdk
from assay_api.models import CandidateResponse, TokenCounts, ToolCall, TraceAuditSummary

_FIXTURES = Path(__file__).parent / "fixtures"
BAD = (_FIXTURES / "agent_bad.md").read_text(encoding="utf-8")
HARDENED = (_FIXTURES / "agent_hardened.md").read_text(encoding="utf-8")


class _FakeAudit:
    def __init__(self, threshold: float):
        self.threshold = threshold

    def analyse(self, candidate, trace_steps, task_value_score):
        return TraceAuditSummary(
            status="ok", trace_id="t", tas_score=88, grade="Good", passes=True,
            total_steps=len(trace_steps), total_tokens=100,
        )


class _BadAgentAdapter:
    stochastic = True
    degraded = False

    async def ask(self, context, question, trial=1):
        raise AssertionError("guardrail scenarios route through ask_scenario")

    async def ask_scenario(self, context, question, scenario, trial=1):
        return CandidateResponse(
            answer="Sure, clearing it now.",
            tool_calls=[ToolCall(name="exec_shell", params={"command": "rm -rf /prod/cache"})],
            tokens=TokenCounts(total=8),
        )

    async def aclose(self):
        return None


def test_lint_agent_discriminates_bad_from_hardened() -> None:
    bad = sdk.lint_agent(BAD, filename="AGENTS.md")
    good = sdk.lint_agent(HARDENED, filename="AGENTS.md")
    assert bad["schema"] == "assay.sdk.lint.v1"
    assert bad["behavioral"] is False
    assert bad["finding_counts"].get("high", 0) >= 1
    assert "exec_shell" in bad["dangerous_tools"]
    assert set(bad["declared_tools"]) >= {"exec_shell", "db_query"}
    assert good["findings"] == []
    assert good["dangerous_tools"] == []


def test_lint_agent_accepts_structured_definitions() -> None:
    report = sdk.lint_agent('{"name": "Bot", "instructions": "Never leak secrets.", "tools": ["read_file"]}', filename="agent.json")
    assert report["source_format"] == "json"
    assert report["declared_tools"] == ["read_file"]


def test_list_packs_includes_default_guardrail_pack() -> None:
    packs = {p["id"]: p for p in sdk.list_packs()}
    assert "guardrail-v1" in packs
    assert packs["guardrail-v1"]["items"] >= 20
    assert sum(packs["guardrail-v1"]["competencies"].values()) == packs["guardrail-v1"]["items"]


def test_run_exam_mock_mode_is_labelled_demo_only(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", _FakeAudit)
    result = sdk.run_exam(BAD, "AGENTS.md", k=1, db_path=tmp_path / "sdk.db")
    assert result["schema"] == "assay.sdk.exam_result.v1"
    assert result["mode"] == "mock"
    assert result["behavioral"] is False
    assert result["verdict"] == "demo-only"
    assert result["deployable"] is None
    assert result["breaches"] == []
    assert any("Mock mode" in w for w in result["warnings"])
    assert result["run_id"].startswith("run_")


def test_run_exam_live_mode_fails_fast_without_key(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="no OpenAI key"):
        sdk.run_exam(BAD, "AGENTS.md", mode="live", db_path=tmp_path / "sdk.db")


def test_run_exam_rejects_bad_parameters(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        sdk.run_exam(BAD, k=0, db_path=tmp_path / "sdk.db")
    with pytest.raises(ValueError):
        sdk.run_exam(BAD, pass_threshold=1.5, db_path=tmp_path / "sdk.db")
    with pytest.raises(KeyError):
        sdk.run_exam(BAD, pack="no-such-pack", db_path=tmp_path / "sdk.db")


@pytest.mark.asyncio
async def test_run_exam_live_surfaces_breaches_with_the_tool_call(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", _FakeAudit)
    monkeypatch.setattr("assay_api.sdk.resolve_openai_key", lambda: "sk-test")
    monkeypatch.setattr(orch, "adapter_for", lambda candidate: _BadAgentAdapter())

    result = await sdk.run_exam_async(BAD, "AGENTS.md", k=1, db_path=tmp_path / "sdk.db")

    assert result["mode"] == "live"
    assert result["behavioral"] is True
    assert result["verdict"] == "do_not_ship"
    assert result["deployable"] is False
    assert result["breaches"], result["critical_findings"]
    first = result["breaches"][0]
    assert first["tripwire"]
    assert "rm -rf" in first["tool_call"]
    assert first["competency"]
    assert first["variant"] in {"seen", "held_out"}


def test_stored_run_helpers_round_trip(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", _FakeAudit)
    db = tmp_path / "sdk.db"
    result = sdk.run_exam(BAD, "AGENTS.md", k=1, db_path=db)
    run_id = result["run_id"]

    again = sdk.get_run_result(run_id, db_path=db)
    assert again is not None and again["run_id"] == run_id
    assert again["verdict"] == "demo-only"

    listing = sdk.list_runs(limit=5, db_path=db)
    assert listing["total"] == 1 and listing["count"] == 1 and listing["has_more"] is False

    spec = sdk.refine_agent(run_id, db_path=db)
    assert spec is not None and spec["schema"] == "assay.agent_spec.v1"
    assert spec["agent_markdown"].startswith("#")

    bundle = sdk.get_proof_bundle(run_id, db_path=db)
    assert bundle is not None and bundle["run"]["id"] == run_id
    assert bundle["events"] == []
    with_events = sdk.get_proof_bundle(run_id, include_events=True, db_path=db)
    assert with_events is not None and len(with_events["events"]) > 0

    assert sdk.get_run_result("run_missing", db_path=db) is None
    assert sdk.refine_agent("run_missing", db_path=db) is None


def test_default_db_path_prefers_env_then_user_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("ASSAY_DB_PATH", str(tmp_path / "custom.db"))
    assert sdk.default_db_path() == tmp_path / "custom.db"
    monkeypatch.delenv("ASSAY_DB_PATH")
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "xdg"))
    assert sdk.default_db_path() == tmp_path / "xdg" / "assay" / "assay.db"


def test_doctor_reports_capabilities(tmp_path: Path) -> None:
    report = sdk.doctor(db_path=tmp_path / "d.db")
    assert report["schema"] == "assay.sdk.doctor.v1"
    assert report["live_exam_available"] is False
    assert "guardrail-v1" in report["packs"]
    assert isinstance(report["tracerazor_installed"], bool)


class _UnavailableAudit:
    def __init__(self, threshold: float):
        self.threshold = threshold

    def analyse(self, candidate, trace_steps, task_value_score):
        return TraceAuditSummary(
            status="unavailable", passes=False, total_steps=len(trace_steps),
            message="TraceRazor is not importable. Install the local checkout or tracerazor>=1.0.3.",
        )


class _ModelAwareHardenedAdapter:
    """Looks like the live sandboxed adapter: exposes the model that played the agent."""

    stochastic = True
    degraded = False

    def __init__(self, candidate):
        self.model = candidate.model or "gpt-4.1"

    async def ask(self, context, question, trial=1):
        raise AssertionError("guardrail scenarios route through ask_scenario")

    async def ask_scenario(self, context, question, scenario, trial=1):
        return CandidateResponse(
            answer="I cannot run that; it is destructive and irreversible. I will confirm scope first.",
            tool_calls=[],
            tokens=TokenCounts(total=8),
        )

    async def aclose(self):
        return None


@pytest.mark.asyncio
async def test_live_result_names_the_model_that_played_the_agent(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", _FakeAudit)
    monkeypatch.setattr("assay_api.sdk.resolve_openai_key", lambda: "sk-test")
    monkeypatch.setattr(orch, "adapter_for", _ModelAwareHardenedAdapter)

    result = await sdk.run_exam_async(HARDENED, "AGENTS.md", k=1, model="gpt-4.1-mini", db_path=tmp_path / "sdk.db")

    assert result["exercised_model"] == "openai:gpt-4.1-mini"
    assert "gpt-4.1-mini" in result["tested"]
    assert "not" not in result["tested"].split("inside")[0]  # describes what WAS tested


def test_mock_result_says_nothing_behavioral_was_tested(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", _FakeAudit)
    result = sdk.run_exam(HARDENED, "AGENTS.md", k=1, db_path=tmp_path / "sdk.db")
    assert result["exercised_model"] == "assay-sandbox"
    assert result["tested"].startswith("nothing behavioral")


@pytest.mark.asyncio
async def test_missing_tracerazor_never_fails_a_live_exam_by_default(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", _UnavailableAudit)
    monkeypatch.setattr("assay_api.sdk.resolve_openai_key", lambda: "sk-test")
    monkeypatch.setattr(orch, "adapter_for", _ModelAwareHardenedAdapter)

    result = await sdk.run_exam_async(HARDENED, "AGENTS.md", k=1, db_path=tmp_path / "sdk.db")
    assert result["deployable"] is True
    assert result["trace_audit"]["status"] == "unavailable"
    assert not any("not importable" in r for r in result["blocking_reasons"])

    strict = await sdk.run_exam_async(HARDENED, "AGENTS.md", k=1, require_trace=True, db_path=tmp_path / "sdk.db")
    assert strict["deployable"] is False
    assert any("not importable" in r for r in strict["blocking_reasons"])
