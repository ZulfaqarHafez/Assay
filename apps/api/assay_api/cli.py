from __future__ import annotations

import argparse
import asyncio
import difflib
import json
import os
import sys
from pathlib import Path
from typing import Any

from .agent_intake import detect_agent_facts
from .agent_refinery import agent_spec_payload
from .agent_research import resolve_openai_key
from .database import (
    get_candidate,
    get_run,
    get_scorecard,
    init_db,
    proof_bundle,
    reset_store_cache,
    save_candidate,
    save_run,
)
from .deployability import (
    DeployabilityDecision,
    evaluate_scorecard,
    load_default_policy,
)
from .exam_packs import get_exam_pack, load_exam_pack_file, register_exam_pack
from .harness import (
    ImprovementPatch,
    build_threat_model,
    load_json_file,
    make_interview_loop,
    research_role,
    scan_agent,
)
from .models import CandidateConfig, RunRecord
from .orchestrator import RunOrchestrator
from .progress import run_comparison
from .tenancy import bind_tenant_id, reset_tenant_id
from .trace_audit import tracerazor_doctor


EXIT_DEPLOYABLE = 0
EXIT_GATE_FAILED = 1
EXIT_RUNTIME_ERROR = 2
EXIT_INVALID_INPUT = 3


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    try:
        match args.command:
            case "scan":
                return _scan_command(args)
            case "research-role":
                return _research_role_command(args)
            case "threat-model":
                return _threat_model_command(args)
            case "make-loop":
                return _make_loop_command(args)
            case "interview":
                return _interview_command(args)
            case "run":
                return _interview_command(args)
            case "improve":
                return _improve_command(args)
            case "compare":
                return _compare_command(args)
            case "gate":
                return _gate_command(args)
            case "doctor":
                return _doctor_command(args)
            case _:
                parser.print_help()
                return EXIT_RUNTIME_ERROR
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return EXIT_INVALID_INPUT
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return EXIT_INVALID_INPUT
    except Exception as exc:
        print(f"assay errored: {type(exc).__name__}: {exc}", file=sys.stderr)
        return EXIT_RUNTIME_ERROR


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="assay",
        description="Pre-deployment interview loop for AI agents.",
    )
    subparsers = parser.add_subparsers(dest="command")

    scan = subparsers.add_parser("scan", help="Inspect an agent artifact and optional tool file")
    scan.add_argument("--agent", required=True, help="Path to AGENTS.md, agent.md, JSON, YAML, or text")
    scan.add_argument("--tools", help="Optional tools.py or JSON tool schema")
    scan.add_argument("--out", help="JSON output path")

    research = subparsers.add_parser("research-role", help="Create a role brief for the interview loop")
    research.add_argument("--agent", required=True)
    research.add_argument("--role", default="", help="Plain-language role, e.g. refund support agent")
    research.add_argument("--research", choices=["off", "fast", "deep"], default="off")
    research.add_argument("--out", required=True)

    threat = subparsers.add_parser("threat-model", help="Build an adversarial threat model")
    threat.add_argument("--agent", required=True)
    threat.add_argument("--tools")
    threat.add_argument("--role-brief")
    threat.add_argument("--out", required=True)

    loop = subparsers.add_parser("make-loop", help="Generate an interview loop from role/threat artifacts")
    loop.add_argument("--role-brief", required=True)
    loop.add_argument("--threat-model")
    loop.add_argument("--out", required=True)

    interview = subparsers.add_parser("interview", help="Run an agent through an interview loop")
    _add_run_args(interview, agent_flag="--agent")

    run = subparsers.add_parser("run", help="Compatibility alias for interview")
    _add_run_args(run, agent_flag="--agent-md")

    improve = subparsers.add_parser("improve", help="Write a diff-first improved AGENTS.md from a run")
    improve.add_argument("--run", required=True, dest="run_id")
    improve.add_argument("--out", required=True)
    improve.add_argument("--db-path")
    improve.add_argument("--tenant", default="local")

    compare = subparsers.add_parser("compare", help="Compare a current run against a baseline")
    compare.add_argument("--baseline", required=True)
    compare.add_argument("--current", required=True)
    compare.add_argument("--out")
    compare.add_argument("--db-path")
    compare.add_argument("--tenant", default="local")

    gate = subparsers.add_parser("gate", help="Apply the deployability gate to an existing run")
    gate.add_argument("--run", required=True, dest="run_id")
    gate.add_argument("--policy", default=None, help="strict, advisory, or path to assay.policy.yaml/json")
    gate.add_argument("--json-out")
    gate.add_argument("--db-path")
    gate.add_argument("--tenant", default="local")

    doctor = subparsers.add_parser("doctor", help="Run local Assay and TraceRazor diagnostics")
    doctor.add_argument("--json-out")
    doctor.add_argument("--tas-threshold", type=float, default=70)
    return parser


def _add_run_args(parser: argparse.ArgumentParser, *, agent_flag: str) -> None:
    parser.add_argument(agent_flag, required=True, dest="agent", help="Path to the agent.md or AGENTS.md file")
    parser.add_argument("--loop", help="Interview loop JSON produced by assay make-loop")
    parser.add_argument("--pack", default="hr-v1", help="Exam pack id when no loop is supplied")
    parser.add_argument("--pack-file", help="Optional JSON/YAML exam pack file to register before running")
    parser.add_argument("--policy", default=None, help="strict, advisory, or path to assay.policy.yaml/json")
    parser.add_argument("--pass-threshold", type=float, default=0.8, help="Minimum held-out competency threshold")
    parser.add_argument("--k", type=int, default=3, help="Trials per seen/held-out item")
    parser.add_argument("--db-path", help="SQLite database path for this run")
    parser.add_argument("--json-out", "--score-out", dest="json_out", help="Scorecard JSON output path")
    parser.add_argument("--proof-out", help="Proof bundle JSON output path")
    parser.add_argument("--summary-out", help="Markdown summary output path")
    parser.add_argument("--tenant", default="local", help="Tenant id to stamp on persisted artifacts")
    parser.add_argument("--live", action="store_true", help="Run the uploaded agent with OpenAI instead of mock mode")
    parser.add_argument("--baseline", dest="baseline_run_id", help="Baseline run id for improvement comparisons")
    parser.add_argument(
        "--require-trace",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Whether TraceRazor must pass for deployability",
    )


def _scan_command(args: argparse.Namespace) -> int:
    payload = scan_agent(args.agent, args.tools).model_dump(mode="json", by_alias=True)
    _write_or_print(payload, args.out)
    return EXIT_DEPLOYABLE


def _research_role_command(args: argparse.Namespace) -> int:
    if args.research in {"fast", "deep"}:
        print(
            "Assay research will send the agent definition and role text to OpenAI as untrusted data.",
            file=sys.stderr,
        )
    payload = research_role(args.agent, role=args.role, mode=args.research)
    _write_json(Path(args.out), payload)
    print(f"Role brief: {args.out}")
    return EXIT_DEPLOYABLE


def _threat_model_command(args: argparse.Namespace) -> int:
    role_brief = load_json_file(args.role_brief) if args.role_brief else None
    payload = build_threat_model(args.agent, role_brief, args.tools).model_dump(mode="json", by_alias=True)
    _write_json(Path(args.out), payload)
    print(f"Threat model: {args.out}")
    return EXIT_DEPLOYABLE


def _make_loop_command(args: argparse.Namespace) -> int:
    role_brief = load_json_file(args.role_brief)
    threat_model = load_json_file(args.threat_model) if args.threat_model else None
    payload = make_interview_loop(role_brief, threat_model).model_dump(mode="json", by_alias=True)
    _write_json(Path(args.out), payload)
    print(f"Interview loop: {args.out}")
    return EXIT_DEPLOYABLE


def _interview_command(args: argparse.Namespace) -> int:
    if not 0 <= args.pass_threshold <= 1:
        print("--pass-threshold must be between 0 and 1", file=sys.stderr)
        return EXIT_INVALID_INPUT
    if args.k < 1 or args.k > 8:
        print("--k must be between 1 and 8", file=sys.stderr)
        return EXIT_INVALID_INPUT

    agent_path = Path(args.agent)
    if not agent_path.exists():
        print(f"agent artifact not found: {agent_path}", file=sys.stderr)
        return EXIT_INVALID_INPUT

    _configure_db(args.db_path)

    if not args.live:
        os.environ["ASSAY_DISABLE_OPENAI"] = "1"
    elif not resolve_openai_key():
        print("--live requires OPENAI_API_KEY (or openai_key) to be configured", file=sys.stderr)
        return EXIT_INVALID_INPUT

    try:
        token = bind_tenant_id(args.tenant)
    except Exception:
        print("--tenant must match ^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$", file=sys.stderr)
        return EXIT_INVALID_INPUT
    try:
        return asyncio.run(_interview_async(args, agent_path))
    except KeyError:
        print(f"exam pack not found: {_pack_id_from_args(args)}", file=sys.stderr)
        return EXIT_INVALID_INPUT
    finally:
        reset_tenant_id(token)


async def _interview_async(args: argparse.Namespace, agent_path: Path) -> int:
    if args.pack_file:
        register_exam_pack(load_exam_pack_file(args.pack_file))

    policy = load_default_policy(args.policy).model_copy(
        update={
            "k": args.k,
            "competency_threshold": args.pass_threshold,
            "require_trace": bool(args.require_trace),
        }
    )
    pack_id = _pack_id_from_args(args)
    pack = get_exam_pack(pack_id)
    markdown = agent_path.read_text(encoding="utf-8")
    detected = detect_agent_facts(markdown)
    loop_payload = load_json_file(args.loop) if args.loop else None
    init_db()

    live = bool(args.live)
    candidate = CandidateConfig(
        name=detected["title"] or agent_path.stem,
        adapter_type="openai-compatible" if live else "mock",
        system_prompt=markdown,
        metadata={
            "source": "assay-cli",
            "agent_path": str(agent_path),
            "interview_loop": loop_payload,
            **detected,
        },
    )
    candidate = save_candidate(candidate)
    run = save_run(
        RunRecord(
            candidate_id=candidate.id,
            exam_pack_id=pack.id,
            k=policy.k,
            competency_threshold=policy.competency_threshold,
            max_transfer_gap=policy.max_transfer_gap,
            tas_threshold=policy.tas_threshold,
            baseline_run_id=getattr(args, "baseline_run_id", None),
        )
    )

    scorecard = await RunOrchestrator().start(run, candidate)
    decision = evaluate_scorecard(scorecard, policy)
    bundle = proof_bundle(run.id)
    if bundle is None:
        raise RuntimeError("proof bundle was not available after run completion")
    bundle["deployability"] = decision.model_dump(mode="json", by_alias=True)
    bundle["interview_loop"] = loop_payload
    bundle["summary"]["deployable"] = decision.deployable
    bundle["summary"]["deployability_label"] = decision.label

    out_dir = Path("artifacts") / "assay"
    json_out = Path(args.json_out) if args.json_out else out_dir / f"{run.id}-scorecard.json"
    proof_out = Path(args.proof_out) if args.proof_out else out_dir / f"{run.id}-proof-bundle.json"
    summary_out = Path(args.summary_out) if args.summary_out else out_dir / f"{run.id}-summary.md"

    score_payload = _score_payload(scorecard.model_dump(mode="json"), decision)
    _write_json(json_out, score_payload)
    _write_json(proof_out, bundle)

    summary = _markdown_summary(score_payload, decision, proof_out)
    summary_out.parent.mkdir(parents=True, exist_ok=True)
    summary_out.write_text(summary, encoding="utf-8")
    print(summary)
    print(f"\nScorecard JSON: {json_out}")
    print(f"Proof bundle JSON: {proof_out}")

    return EXIT_DEPLOYABLE if decision.deployable else EXIT_GATE_FAILED


def _improve_command(args: argparse.Namespace) -> int:
    _configure_db(args.db_path)
    token = bind_tenant_id(args.tenant)
    try:
        run = get_run(args.run_id)
        if run is None:
            print(f"run not found: {args.run_id}", file=sys.stderr)
            return EXIT_INVALID_INPUT
        candidate = get_candidate(run.candidate_id)
        scorecard = get_scorecard(run.id)
        spec = agent_spec_payload(run.id)
        if scorecard is None or spec is None:
            print("run has no completed scorecard yet", file=sys.stderr)
            return EXIT_RUNTIME_ERROR
        original = candidate.system_prompt if candidate else ""
        refined = str(spec.get("agent_markdown") or "")
        diff = _unified_diff(original, refined)
        decision = evaluate_scorecard(scorecard)
        patch = ImprovementPatch(
            run_id=run.id,
            source_agent_path=(candidate.metadata or {}).get("agent_path") if candidate else None,
            diff_markdown=diff,
            refined_markdown=refined,
            blocking_reasons=decision.blocking_reasons,
        )
        markdown = _improvement_markdown(patch)
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(markdown, encoding="utf-8")
        print(f"Improved agent markdown: {args.out}")
        return EXIT_DEPLOYABLE
    finally:
        reset_tenant_id(token)


def _compare_command(args: argparse.Namespace) -> int:
    _configure_db(args.db_path)
    token = bind_tenant_id(args.tenant)
    try:
        comparison = run_comparison(args.current, args.baseline)
        if comparison is None:
            print("comparison unavailable; both runs must have scorecards", file=sys.stderr)
            return EXIT_RUNTIME_ERROR
        current = get_scorecard(args.current)
        baseline = get_scorecard(args.baseline)
        if current is None or baseline is None:
            print("comparison unavailable; both runs must have scorecards", file=sys.stderr)
            return EXIT_RUNTIME_ERROR
        current_decision = evaluate_scorecard(current)
        baseline_decision = evaluate_scorecard(baseline)
        markdown = _comparison_markdown(
            comparison.model_dump(mode="json"),
            baseline_decision,
            current_decision,
            baseline.failure_reasons,
            current.failure_reasons,
        )
        if args.out:
            Path(args.out).parent.mkdir(parents=True, exist_ok=True)
            Path(args.out).write_text(markdown, encoding="utf-8")
            print(f"Comparison: {args.out}")
        else:
            print(markdown)
        return EXIT_DEPLOYABLE if current_decision.deployable else EXIT_GATE_FAILED
    finally:
        reset_tenant_id(token)


def _gate_command(args: argparse.Namespace) -> int:
    _configure_db(args.db_path)
    token = bind_tenant_id(args.tenant)
    try:
        scorecard = get_scorecard(args.run_id)
        if scorecard is None:
            print(f"scorecard not found for run: {args.run_id}", file=sys.stderr)
            return EXIT_INVALID_INPUT
        decision = evaluate_scorecard(scorecard, load_default_policy(args.policy))
        payload = decision.model_dump(mode="json", by_alias=True)
        if args.json_out:
            _write_json(Path(args.json_out), payload)
        print(_gate_summary(decision))
        return EXIT_DEPLOYABLE if decision.deployable else EXIT_GATE_FAILED
    finally:
        reset_tenant_id(token)


def _doctor_command(args: argparse.Namespace) -> int:
    payload = {
        "schema": "assay.doctor.v1",
        "database_path": str(Path(os.environ.get("ASSAY_DB_PATH", "apps/api/data/assay.db"))),
        "tracerazor": tracerazor_doctor(args.tas_threshold),
    }
    _write_or_print(payload, args.json_out)
    status = payload["tracerazor"]["status"]
    return EXIT_DEPLOYABLE if status == "passed" else EXIT_GATE_FAILED


def _pack_id_from_args(args: argparse.Namespace) -> str:
    if getattr(args, "loop", None):
        loop = load_json_file(args.loop)
        return str(loop.get("recommended_pack_id") or args.pack)
    return args.pack


def _configure_db(path: str | None) -> None:
    if path:
        os.environ["ASSAY_DB_PATH"] = str(Path(path))
        os.environ["ASSAY_DB_BACKEND"] = "sqlite"
        reset_store_cache()


def _score_payload(scorecard: dict[str, Any], decision: DeployabilityDecision) -> dict[str, Any]:
    return {
        "schema": "assay.scorecard.v1",
        "run_id": scorecard.get("run_id"),
        "passed": decision.deployable,
        "certified": bool(scorecard.get("certified")),
        "deployability": decision.model_dump(mode="json", by_alias=True),
        "failure_reasons": scorecard.get("failure_reasons") or [],
        "blocking_failure_reasons": decision.blocking_reasons,
        "scorecard": scorecard,
    }


def _markdown_summary(payload: dict[str, Any], decision: DeployabilityDecision, proof_out: Path) -> str:
    verdict = decision.label
    metrics = decision.metrics
    lines = [
        f"# Assay deployability: {verdict}",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| Run | `{payload['run_id']}` |",
        f"| Decision | {decision.summary} |",
        f"| Mean held-out score | {metrics.get('mean_held_out_score', 0):.3f} |",
        f"| Threshold | {decision.policy.competency_threshold:.3f} |",
        f"| Max transfer gap | {metrics.get('max_transfer_gap', 0):.3f} |",
        f"| Trace | {metrics.get('trace_status')} / TAS {metrics.get('tas_score')} |",
        f"| Proof bundle | `{proof_out}` |",
    ]
    if decision.blocking_reasons:
        lines.extend(["", "## Blocking Reasons", ""])
        lines.extend(f"- {reason}" for reason in decision.blocking_reasons)
    if decision.warnings:
        lines.extend(["", "## Warnings", ""])
        lines.extend(f"- {reason}" for reason in decision.warnings[:8])
    return "\n".join(lines)


def _gate_summary(decision: DeployabilityDecision) -> str:
    lines = [f"Assay gate: {decision.label}", decision.summary]
    if decision.blocking_reasons:
        lines.append("")
        lines.extend(f"- {reason}" for reason in decision.blocking_reasons)
    return "\n".join(lines)


def _comparison_markdown(
    comparison: dict[str, Any],
    baseline: DeployabilityDecision,
    current: DeployabilityDecision,
    baseline_failures: list[str],
    current_failures: list[str],
) -> str:
    fixed = sorted(set(baseline_failures) - set(current_failures))
    remaining = sorted(set(current_failures))
    lines = [
        "# Assay run comparison",
        "",
        f"- Baseline: `{comparison['baseline_run_id']}` ({baseline.label})",
        f"- Current: `{comparison['run_id']}` ({current.label})",
        f"- Improved competencies: {comparison['improved']}",
        f"- Regressed competencies: {comparison['regressed']}",
        f"- Unchanged competencies: {comparison['unchanged']}",
        f"- Deployable now: {'yes' if current.deployable else 'no'}",
        "",
        "## Competencies",
        "",
        "| Competency | Baseline | Current | Delta | Outcome |",
        "| --- | ---: | ---: | ---: | --- |",
    ]
    for row in comparison.get("competencies", []):
        lines.append(
            "| {competency} | {base} | {current} | {delta} | {outcome} |".format(
                competency=row.get("label") or row.get("competency"),
                base=_pct(row.get("baseline_score")),
                current=_pct(row.get("current_score")),
                delta=_signed_pct(row.get("delta")),
                outcome=row.get("outcome"),
            )
        )
    lines.extend(["", "## Fixed Failures", ""])
    lines.extend(f"- {item}" for item in fixed) if fixed else lines.append("- none")
    lines.extend(["", "## Remaining Failures", ""])
    lines.extend(f"- {item}" for item in remaining) if remaining else lines.append("- none")
    return "\n".join(lines)


def _improvement_markdown(patch: ImprovementPatch) -> str:
    return "\n".join(
        [
            "# Assay improvement patch",
            "",
            f"- Run: `{patch.run_id}`",
            f"- Source: `{patch.source_agent_path or 'persisted candidate prompt'}`",
            "",
            "## Blocking reasons this patch targets",
            "",
            *[f"- {reason}" for reason in (patch.blocking_reasons or ["none"])],
            "",
            "## Diff first",
            "",
            "```diff",
            patch.diff_markdown or "# No textual diff was available.",
            "```",
            "",
            "## Refined AGENTS.md",
            "",
            patch.refined_markdown,
        ]
    )


def _unified_diff(original: str, refined: str) -> str:
    return "\n".join(
        difflib.unified_diff(
            original.splitlines(),
            refined.splitlines(),
            fromfile="original/agent.md",
            tofile="refined/AGENTS.md",
            lineterm="",
        )
    )


def _pct(value: Any) -> str:
    if value is None:
        return "-"
    return f"{float(value) * 100:.0f}%"


def _signed_pct(value: Any) -> str:
    if value is None:
        return "-"
    rounded = round(float(value) * 100)
    return f"+{rounded}%" if rounded > 0 else f"{rounded}%"


def _write_or_print(payload: Any, path: str | None) -> None:
    if path:
        _write_json(Path(path), payload)
        print(path)
    else:
        print(json.dumps(payload, indent=2, sort_keys=True))


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
