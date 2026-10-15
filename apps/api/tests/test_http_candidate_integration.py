"""A real agent over a real socket: no stand-in model, no key.

Starts the reference HTTP agent (examples/http_candidate) on a free local port
and runs the guardrail exam against it through the real HTTP adapter, the real
orchestrator and gate, and TraceRazor when it is installed. This is the path a
user takes to examine their own runtime instead of a definition.
"""

from __future__ import annotations

import asyncio
import socket
import threading
import time

import pytest
import uvicorn

from examples.http_candidate.server import app as reference_agent


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture
def agent_url(monkeypatch: pytest.MonkeyPatch):
    # The reference agent listens on loopback, which the SSRF guard blocks by default.
    monkeypatch.setenv("ASSAY_HTTP_CANDIDATE_ALLOW_PRIVATE", "1")
    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(reference_agent, host="127.0.0.1", port=port, log_level="error"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.time() + 10
    while not server.started and time.time() < deadline:
        time.sleep(0.05)
    assert server.started, "reference agent did not start"
    yield f"http://127.0.0.1:{port}/ask"
    server.should_exit = True
    thread.join(timeout=5)


@pytest.mark.no_model
def test_guardrail_exam_runs_end_to_end_against_a_real_http_agent(agent_url: str) -> None:
    from assay_api.database import init_db, save_candidate, save_run
    from assay_api.deployability import evaluate_scorecard, policy_for_run
    from assay_api.models import CandidateConfig, RunRecord
    from assay_api.orchestrator import RunOrchestrator

    init_db()
    candidate = save_candidate(CandidateConfig(name="Reference agent", adapter_type="http", endpoint_url=agent_url))
    run = save_run(RunRecord(candidate_id=candidate.id, exam_pack_id="guardrail-v1", k=1))

    scorecard = asyncio.run(RunOrchestrator().start(run, candidate))
    decision = evaluate_scorecard(scorecard, policy_for_run(run))

    assert scorecard.behavioral is True
    assert scorecard.simulator_model == f"http:{agent_url}"
    # The reference agent takes no forbidden action, so no tripwire fires.
    assert not [r for r in scorecard.failure_reasons if "guardrail_breach" in r]
    assert decision.verdict in {"ship", "probation", "do_not_ship"}
    assert set(scorecard.held_out_scores) == set(scorecard.seen_scores)


@pytest.mark.no_model
def test_http_api_examines_a_registered_http_agent(agent_url: str) -> None:
    from fastapi.testclient import TestClient

    from assay_api.main import app

    with TestClient(app) as client:
        candidate = client.post(
            "/candidates", json={"name": "Reference agent", "adapter_type": "http", "endpoint_url": agent_url}
        ).json()
        run = client.post("/runs", json={"candidate_id": candidate["id"], "k": 1}).json()
        started = client.post(f"/runs/{run['id']}/start")
        deployability = client.get(f"/runs/{run['id']}/deployability").json()

    assert started.status_code == 200, started.text
    assert started.json()["behavioral"] is True
    assert deployability["verdict"] != "unverified"
