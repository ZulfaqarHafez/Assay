"""Real-model tests: the exam played by an actual OpenAI model, nothing scripted.

These run only when ``OPENAI_API_KEY`` is set (conftest skips them otherwise)
and they spend real tokens, so they use k=1 and the default fast model unless
``ASSAY_OPENAI_MODEL`` says otherwise. CI runs them when the repository has an
``OPENAI_API_KEY`` secret.

They check the claims the product makes, end to end on every surface:
the bad fixture breaches a guardrail and is held, the hardened one does not
breach, and the CLI, HTTP API, and MCP server agree.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

pytestmark = pytest.mark.live

_FIXTURES = Path(__file__).parent / "fixtures"
BAD = (_FIXTURES / "agent_bad.md").read_text(encoding="utf-8")
HARDENED = (_FIXTURES / "agent_hardened.md").read_text(encoding="utf-8")


def test_bad_agent_breaches_and_is_held(tmp_path: Path) -> None:
    from assay_api import sdk

    result = sdk.run_exam(BAD, "AGENTS.md", k=1, db_path=tmp_path / "live.db")

    assert result["behavioral"] is True
    assert result["exercised_model"].startswith("openai:")
    assert result["breaches"], "the over-permissioned agent should trip at least one tripwire"
    assert result["verdict"] == "do_not_ship"
    assert all(b["tool_call"] for b in result["breaches"])


def test_hardened_agent_does_not_breach(tmp_path: Path) -> None:
    from assay_api import sdk

    result = sdk.run_exam(HARDENED, "AGENTS.md", k=1, db_path=tmp_path / "live.db")

    assert result["behavioral"] is True
    assert result["breaches"] == []
    assert result["verdict"] in {"ship", "probation"}


def test_cli_gates_the_bad_agent(tmp_path: Path) -> None:
    from assay_api import cli

    agent = tmp_path / "AGENTS.md"
    agent.write_text(BAD, encoding="utf-8")
    exit_code = cli.main(
        [
            "run", "--agent-md", str(agent), "--k", "1",
            "--db-path", str(tmp_path / "cli.db"),
            "--json-out", str(tmp_path / "score.json"),
            "--proof-out", str(tmp_path / "proof.json"),
            "--summary-out", str(tmp_path / "summary.md"),
        ]
    )
    payload = json.loads((tmp_path / "score.json").read_text(encoding="utf-8"))

    assert exit_code == cli.EXIT_GATE_FAILED
    assert payload["deployability"]["verdict"] == "do_not_ship"
    assert payload["scorecard"]["behavioral"] is True


def test_http_api_runs_the_exam_live() -> None:
    from fastapi.testclient import TestClient

    from assay_api.main import app

    with TestClient(app) as client:
        intake = client.post("/candidates/from-markdown", json={"markdown": BAD}).json()
        assert intake["exam_available"] is True
        run = client.post("/runs", json={"candidate_id": intake["candidate"]["id"], "k": 1}).json()
        started = client.post(f"/runs/{run['id']}/start")
        decision = client.get(f"/runs/{run['id']}/deployability").json()

    assert started.status_code == 200, started.text
    assert started.json()["behavioral"] is True
    assert decision["verdict"] == "do_not_ship"


def test_mcp_server_runs_the_exam_live(tmp_path: Path) -> None:
    pytest.importorskip("mcp")
    from mcp.client import Client

    from assay_api import sdk
    from assay_api.mcp_server import server

    sdk.configure(tmp_path / "mcp.db")

    async def call() -> dict:
        async with Client(server) as client:
            result = await client.call_tool("assay_run_exam", {"content": BAD, "filename": "AGENTS.md", "k": 1})
            assert result.is_error is False, result.content[0].text
            return result.structured_content

    summary = asyncio.run(call())
    assert summary["behavioral"] is True
    assert summary["breaches"]
