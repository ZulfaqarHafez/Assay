"""Regenerate the website's showcase runs from Assay's real pipeline.

The homepage shows two genuine exam results: a careful reference agent that
holds its guardrails, and a deliberately careless one that breaches them.
Both are real agents behind real HTTP endpoints (examples/http_candidate),
examined by the real orchestrator, tripwires, gate and TraceRazor. Nothing is
staged by hand; this script runs the exams and snapshots the results.

Usage (API on :8010 with ASSAY_HTTP_CANDIDATE_ALLOW_PRIVATE=1, the two agents on :8091 / :8092):

    PYTHONPATH=apps/api python scripts/export_showcase.py --api http://127.0.0.1:8010

Writes apps/web/src/data/showcase/{careful,careless}.json, which the site bundles.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))
from assay_api.sdk import _breaches  # noqa: E402
from assay_api.deployability import DeployabilityDecision  # noqa: E402
from assay_api.models import Scorecard  # noqa: E402
from assay_api.tool_parser import parse_tools_from_markdown  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[1] / "apps" / "api" / "tests" / "fixtures"
OUT = Path(__file__).resolve().parents[1] / "apps" / "web" / "src" / "data" / "showcase"

AGENTS = {
    "careful": {
        "name": "Ops helper (hardened)",
        "endpoint": "http://127.0.0.1:8091/ask",
        "definition": FIXTURES / "agent_hardened.md",
        "note": "The reference agent in examples/http_candidate/server.py: refuses destructive actions, treats embedded text as data, never reveals secrets.",
    },
    "careless": {
        "name": "Ops helper (careless)",
        "endpoint": "http://127.0.0.1:8092/ask",
        "definition": FIXTURES / "agent_bad.md",
        "note": "A deliberately careless agent (examples/http_candidate/careless.py) that runs whatever it is asked to run. Never ship an agent like this.",
    },
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://127.0.0.1:8010")
    parser.add_argument("--k", type=int, default=1)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    client = httpx.Client(base_url=args.api, timeout=600)

    for key, spec in AGENTS.items():
        markdown = spec["definition"].read_text(encoding="utf-8")
        tools = [t.model_dump(mode="json") for t in parse_tools_from_markdown(markdown)]
        candidate = client.post(
            "/candidates",
            json={
                "name": spec["name"],
                "adapter_type": "http",
                "endpoint_url": spec["endpoint"],
                "system_prompt": markdown,
                "tools": tools,
                "metadata": {"source": "showcase"},
            },
        ).raise_for_status().json()
        run = client.post(
            "/runs", json={"candidate_id": candidate["id"], "exam_pack_id": "guardrail-v1", "k": args.k}
        ).raise_for_status().json()
        client.post(f"/runs/{run['id']}/start").raise_for_status()
        verdict = client.get(f"/runs/{run['id']}/verdict").raise_for_status().json()
        events = client.get(f"/runs/{run['id']}/events").raise_for_status().json()
        scorecard = Scorecard.model_validate(verdict["scorecard"])
        decision = DeployabilityDecision.model_validate(verdict["deployability"])
        tool_calls = [
            {
                "competency": e["payload"]["competency"],
                "variant": e["payload"]["variant"],
                "name": e["payload"]["tool"]["name"],
                "params": e["payload"]["tool"]["params"],
            }
            for e in events
            if e["event_type"] == "tool_called"
        ]
        probes = sum(1 for e in events if e["event_type"] == "question_asked")
        payload = {
            "schema": "assay.showcase_run.v1",
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "note": spec["note"],
            "run_id": run["id"],
            "exam_pack_id": run["exam_pack_id"],
            "k": run["k"],
            "candidate": {"name": spec["name"], "tools": [t["name"] for t in tools], "definition": markdown},
            "exercised_by": scorecard.simulator_model,
            "verdict": decision.verdict,
            "label": decision.label,
            "deployable": decision.deployable,
            "summary": decision.summary,
            "probes": probes,
            "held_out_scores": scorecard.held_out_scores,
            "seen_scores": scorecard.seen_scores,
            "pass_at_k": scorecard.pass_at_k,
            "breaches": _breaches(decision, scorecard),
            "blocking_reasons": decision.blocking_reasons,
            "warnings": decision.warnings,
            "privilege_delta": scorecard.privilege_delta.model_dump(mode="json") if scorecard.privilege_delta else None,
            "trace_audit": {
                "status": scorecard.trace_audit.status,
                "tas_score": scorecard.trace_audit.tas_score,
                "passes": scorecard.trace_audit.passes,
                "fixes": len(scorecard.trace_audit.fixes or []),
            },
            "tool_calls": tool_calls,
        }
        out = OUT / f"{key}.json"
        out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(f"{key}: {run['id']} verdict={decision.verdict} breaches={len(payload['breaches'])} tool_calls={len(tool_calls)} -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
