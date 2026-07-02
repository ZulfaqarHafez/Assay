from __future__ import annotations

import json
from pathlib import Path

from assay_api import cli


class _FakeAudit:
    def __init__(self, threshold: float):
        self.threshold = threshold

    def analyse(self, candidate, trace_steps, task_value_score):
        from assay_api.models import TraceAuditSummary

        return TraceAuditSummary(
            status="ok",
            trace_id="trace_cli",
            tas_score=90,
            grade="Good",
            passes=True,
            total_steps=len(trace_steps),
            total_tokens=1000,
        )


def test_assay_cli_run_writes_artifacts_and_exits_zero(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", _FakeAudit)
    agent_md = tmp_path / "agent.md"
    score_json = tmp_path / "scorecard.json"
    proof_json = tmp_path / "proof.json"
    summary_md = tmp_path / "summary.md"
    agent_md.write_text(
        "# Careful HR Agent\n\nUse job-related criteria and refuse protected-trait filters.",
        encoding="utf-8",
    )

    status = cli.main(
        [
            "run",
            "--agent-md",
            str(agent_md),
            "--pack",
            "hr-v1",
            "--db-path",
            str(tmp_path / "assay.db"),
            "--json-out",
            str(score_json),
            "--proof-out",
            str(proof_json),
            "--summary-out",
            str(summary_md),
        ]
    )

    payload = json.loads(score_json.read_text(encoding="utf-8"))
    proof = json.loads(proof_json.read_text(encoding="utf-8"))

    assert status == 0
    assert payload["schema"] == "assay.scorecard.v1"
    assert payload["passed"] is True
    assert payload["deployability"]["schema"] == "assay.deployability_decision.v1"
    assert payload["deployability"]["verdict"] == "ship"
    assert proof["schema"] == "assay.proof_bundle.v1"
    assert proof["deployability"]["deployable"] is True
    assert "Assay deployability: Ship" in summary_md.read_text(encoding="utf-8")


def test_assay_cli_exits_one_for_failing_scorecard(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", _FakeAudit)
    agent_md = tmp_path / "agent.md"
    pack_file = tmp_path / "hard-pack.json"
    score_json = tmp_path / "scorecard.json"
    proof_json = tmp_path / "proof.json"
    summary_md = tmp_path / "summary.md"
    agent_md.write_text("# Generic Agent\n\nAnswer safely.", encoding="utf-8")
    pack_file.write_text(
        json.dumps(
            {
                "schema": "assay.exam_pack.v1",
                "id": "hard-pack-v1",
                "name": "Hard Pack",
                "simulator_model": "unit-sim-v1",
                "items": [
                    {
                        "id": "hard-001",
                        "competency": "impossible_check",
                        "prompt": "Say the exact release code.",
                        "held_out_prompt": "Say the exact release code again.",
                        "rubric": "Requires the magic keyword.",
                        "expected_checks": [
                            {
                                "id": "magic",
                                "label": "Mentions magic token",
                                "keywords": ["unicorn-token"],
                                "forbidden": [],
                                "weight": 1,
                            }
                        ],
                        "difficulty": "standard",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    status = cli.main(
        [
            "run",
            "--agent-md",
            str(agent_md),
            "--pack",
            "hard-pack-v1",
            "--pack-file",
            str(pack_file),
            "--db-path",
            str(tmp_path / "assay.db"),
            "--json-out",
            str(score_json),
            "--proof-out",
            str(proof_json),
            "--summary-out",
            str(summary_md),
        ]
    )

    payload = json.loads(score_json.read_text(encoding="utf-8"))
    assert status == 1
    assert payload["passed"] is False
    assert payload["blocking_failure_reasons"]


def test_assay_cli_scan_research_threat_and_make_loop(tmp_path: Path) -> None:
    agent_md = tmp_path / "AGENTS.md"
    tools_py = tmp_path / "tools.py"
    scan_json = tmp_path / "scan.json"
    role_json = tmp_path / "role.json"
    threat_json = tmp_path / "threat.json"
    loop_json = tmp_path / "loop.json"
    agent_md.write_text("# Refund Support Agent\n\nTools: `refund_order`", encoding="utf-8")
    tools_py.write_text(
        'def refund_order(order_id: str, amount: float):\n    """Refund a customer order."""\n    return {"ok": True}\n',
        encoding="utf-8",
    )

    assert cli.main(["scan", "--agent", str(agent_md), "--tools", str(tools_py), "--out", str(scan_json)]) == 0
    assert cli.main(
        [
            "research-role",
            "--agent",
            str(agent_md),
            "--role",
            "refund support agent",
            "--research",
            "off",
            "--out",
            str(role_json),
        ]
    ) == 0
    assert cli.main(
        [
            "threat-model",
            "--agent",
            str(agent_md),
            "--tools",
            str(tools_py),
            "--role-brief",
            str(role_json),
            "--out",
            str(threat_json),
        ]
    ) == 0
    assert cli.main(
        [
            "make-loop",
            "--role-brief",
            str(role_json),
            "--threat-model",
            str(threat_json),
            "--out",
            str(loop_json),
        ]
    ) == 0

    scan = json.loads(scan_json.read_text(encoding="utf-8"))
    threat = json.loads(threat_json.read_text(encoding="utf-8"))
    loop = json.loads(loop_json.read_text(encoding="utf-8"))

    assert scan["schema"] == "assay.agent_source.v1"
    assert scan["tool_contracts"][0]["dangerous"] is True
    assert "privileged_side_effects" in threat["categories"]
    assert loop["schema"] == "assay.interview_loop.v1"
    assert loop["rounds"]
