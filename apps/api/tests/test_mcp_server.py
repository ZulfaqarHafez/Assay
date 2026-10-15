"""The MCP server, driven through the SDK's in-memory client."""

from __future__ import annotations

from pathlib import Path

import pytest

pytest.importorskip("mcp", reason="install the 'mcp' extra to test the MCP server")

from mcp.client import Client  # noqa: E402

from assay_api.models import TraceAuditSummary  # noqa: E402

_FIXTURES = Path(__file__).parent / "fixtures"
BAD = (_FIXTURES / "agent_bad.md").read_text(encoding="utf-8")

EXPECTED_TOOLS = {
    "assay_lint_agent",
    "assay_list_exam_packs",
    "assay_run_exam",
    "assay_get_run",
    "assay_list_runs",
    "assay_refine_agent",
    "assay_get_proof_bundle",
    "assay_doctor",
}


class _FakeAudit:
    def __init__(self, threshold: float):
        self.threshold = threshold

    def analyse(self, candidate, trace_steps, task_value_score):
        return TraceAuditSummary(
            status="ok", trace_id="t", tas_score=88, grade="Good", passes=True,
            total_steps=len(trace_steps), total_tokens=100,
        )


def _structured(result):
    return result.structured_content


@pytest.fixture
def server(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", _FakeAudit)
    from assay_api import sdk
    from assay_api.mcp_server import server as mcp_server

    sdk.configure(tmp_path / "mcp.db")
    return mcp_server


@pytest.mark.asyncio
async def test_lists_every_tool_with_annotations(server) -> None:
    async with Client(server) as client:
        listing = await client.list_tools()
    tools = {tool.name: tool for tool in listing.tools}
    assert set(tools) == EXPECTED_TOOLS
    assert tools["assay_lint_agent"].annotations.read_only_hint is True
    assert tools["assay_run_exam"].annotations.read_only_hint is False
    assert tools["assay_run_exam"].annotations.destructive_hint is False
    props = tools["assay_run_exam"].input_schema["properties"]
    assert {"content", "pack", "k", "pass_threshold", "mode"} <= set(props)


@pytest.mark.asyncio
async def test_lint_tool_returns_structured_findings(server) -> None:
    async with Client(server) as client:
        result = await client.call_tool("assay_lint_agent", {"content": BAD, "filename": "AGENTS.md"})
    assert result.is_error is False
    payload = _structured(result)
    assert payload["finding_counts"].get("high", 0) >= 1
    assert "exec_shell" in payload["dangerous_tools"]


@pytest.mark.asyncio
async def test_exam_round_trip_through_stored_run_tools(server) -> None:
    async with Client(server) as client:
        exam = await client.call_tool("assay_run_exam", {"content": BAD, "filename": "AGENTS.md", "k": 1})
        assert exam.is_error is False
        summary = _structured(exam)
        assert summary["mode"] == "mock" and summary["verdict"] == "demo-only"
        run_id = summary["run_id"]

        fetched = await client.call_tool("assay_get_run", {"run_id": run_id})
        assert _structured(fetched)["run_id"] == run_id

        refined = await client.call_tool("assay_refine_agent", {"run_id": run_id})
        spec = _structured(refined)
        assert spec["agent_markdown"].startswith("#")
        assert "original_markdown" not in spec

        listing = await client.call_tool("assay_list_runs", {"limit": 5})
        assert _structured(listing)["total"] == 1

        bundle = await client.call_tool("assay_get_proof_bundle", {"run_id": run_id})
        assert _structured(bundle)["run"]["id"] == run_id


@pytest.mark.asyncio
async def test_expected_failures_reach_the_model_as_messages(server) -> None:
    async with Client(server) as client:
        missing = await client.call_tool("assay_get_run", {"run_id": "run_missing"})
        assert missing.is_error is True
        assert "not found" in missing.content[0].text

        bad_pack = await client.call_tool("assay_run_exam", {"content": BAD, "pack": "nope"})
        assert bad_pack.is_error is True
        assert "guardrail-v1" in bad_pack.content[0].text

        no_key = await client.call_tool("assay_run_exam", {"content": BAD, "mode": "live"})
        assert no_key.is_error is True
        assert "OPENAI_API_KEY" in no_key.content[0].text

        empty = await client.call_tool("assay_lint_agent", {"content": "   "})
        assert empty.is_error is True
        assert "empty" in empty.content[0].text


@pytest.mark.asyncio
async def test_doctor_and_packs(server) -> None:
    async with Client(server) as client:
        doctor = _structured(await client.call_tool("assay_doctor", {}))
        packs = _structured(await client.call_tool("assay_list_exam_packs", {}))
    assert doctor["live_exam_available"] is False
    assert packs["default"] == "guardrail-v1"
    assert any(p["id"] == "guardrail-v1" for p in packs["packs"])
