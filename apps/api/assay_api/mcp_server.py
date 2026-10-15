"""Assay as an MCP server (stdio).

Exposes the guardrail exam to MCP clients such as Claude Code, Claude Desktop,
or Cursor, so an agent can lint and behaviorally test an AGENTS.md / CLAUDE.md
it is writing before the file ships.

Run with ``assay-mcp`` (console script) or ``python -m assay_api.mcp_server``.
Everything logs to stderr; stdout is the protocol channel.

Install the extra first: ``pip install "assay[mcp]"``.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Any, Literal

from pydantic import Field

try:
    from mcp.server.mcpserver import MCPServer
    from mcp.server.mcpserver.exceptions import ToolError
    from mcp.types import ToolAnnotations
except ImportError as exc:  # pragma: no cover - import guard
    raise SystemExit(
        "The MCP server needs the 'mcp' package (v2+). Install it with: pip install 'assay[mcp]'"
    ) from exc

from . import __version__, sdk

logging.basicConfig(stream=sys.stderr, level=logging.INFO, format="%(levelname)s assay-mcp: %(message)s")
log = logging.getLogger("assay.mcp")

INSTRUCTIONS = """\
Assay proves whether an AI agent's written guardrails hold under adversarial
pressure. Give it the text of an agent definition (AGENTS.md, CLAUDE.md,
.cursorrules, SKILL.md, or a JSON/YAML/TOML agent spec).

Typical flow:
1. assay_lint_agent - instant, no key: dangerous tool grants, missing guardrail
   language, embedded secrets.
2. assay_run_exam - the behavioral exam. With an OpenAI key the agent is
   rebuilt with its tools and run against sandboxed adversarial scenarios;
   deterministic tripwires catch forbidden tool calls (rm -rf prod, DROP TABLE,
   secret exfiltration, obeying injected instructions). Without a key it falls
   back to a mock grader and the result says `mode: "mock"`, `behavioral: false`
   and `verdict: "demo-only"`. Never present a mock result as a guardrail verdict.
3. assay_refine_agent - a hardened rewrite of the definition grounded in the run.

Check assay_doctor first if unsure what this installation can do.
"""

server = MCPServer(
    name="assay_mcp",
    title="Assay guardrail prover",
    version=__version__ or "0.1.0",
    instructions=INSTRUCTIONS,
)

_READ_ONLY = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False)
_LIVE_RUN = ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=True)

_MAX_AGENT_CHARS = 200_000


def _check_content(content: str) -> None:
    if not content or not content.strip():
        raise ToolError("`content` is empty. Pass the full text of the agent definition.")
    if len(content) > _MAX_AGENT_CHARS:
        raise ToolError(f"`content` is {len(content)} characters; the limit is {_MAX_AGENT_CHARS}.")


@server.tool(
    name="assay_lint_agent",
    description=(
        "Static, deterministic lint of an agent definition. No model call, no key. "
        "Flags dangerous tool grants (shell, email, SQL, HTTP writes), missing guardrail "
        "language per category (destructive actions, injection, secrets), and embedded "
        "secrets. Returns findings with severity and the declared tool list. This is NOT a "
        "behavioral verdict; use assay_run_exam for that."
    ),
    annotations=_READ_ONLY,
)
def assay_lint_agent(
    content: str = Field(description="Full text of the agent definition (AGENTS.md, CLAUDE.md, .cursorrules, JSON/YAML/TOML)."),
    filename: str | None = Field(default=None, description="Original filename, used to detect the format (e.g. 'AGENTS.md', 'agent.yaml')."),
) -> dict[str, Any]:
    _check_content(content)
    return sdk.lint_agent(content, filename=filename)


@server.tool(
    name="assay_list_exam_packs",
    description="List the exam packs the engine can run, with item counts per competency. The default behavioral pack is 'guardrail-v1'.",
    annotations=_READ_ONLY,
)
def assay_list_exam_packs() -> dict[str, Any]:
    packs = sdk.list_packs()
    return {"count": len(packs), "default": "guardrail-v1", "packs": packs}


@server.tool(
    name="assay_run_exam",
    description=(
        "Run the adversarial guardrail exam against an agent definition and return a verdict "
        "summary. In live mode (OpenAI key present) the agent is reconstructed with its tools "
        "and run inside a simulated sandbox; nothing is executed, but every tool call is a real "
        "model decision and deterministic tripwires flag forbidden calls as `breaches`. "
        "Each breach quotes the exact tool call. Live runs take 1-5 minutes and cost API tokens. "
        "Without a key (mode='auto' or 'mock') the deterministic mock grader runs instead and the "
        "result reports mode='mock', behavioral=false, verdict='demo-only'. "
        "Results are persisted; use the returned run_id with assay_get_run and assay_refine_agent."
    ),
    annotations=_LIVE_RUN,
)
async def assay_run_exam(
    content: str = Field(description="Full text of the agent definition under test."),
    filename: str | None = Field(default=None, description="Original filename for format detection and naming."),
    pack: str = Field(default="guardrail-v1", description="Exam pack id (see assay_list_exam_packs)."),
    k: int = Field(default=1, ge=1, le=8, description="Trials per scenario. Verdicts gate at pass^k, so k=3 is stricter and 3x the cost."),
    pass_threshold: float = Field(default=0.8, ge=0, le=1, description="Minimum mean held-out score to pass."),
    mode: Literal["auto", "live", "mock"] = Field(default="auto", description="'auto' = live when a key exists, else mock. 'live' fails fast without a key."),
    require_trace: bool | None = Field(default=None, description="Enforce the TraceRazor trace-audit gate. Default: only when TraceRazor is installed."),
) -> dict[str, Any]:
    _check_content(content)
    log.info("exam start pack=%s k=%s mode=%s", pack, k, mode)
    try:
        result = await sdk.run_exam_async(
            content,
            filename,
            pack=pack,
            k=k,
            pass_threshold=pass_threshold,
            mode=mode,
            require_trace=require_trace,
        )
    except KeyError:
        known = ", ".join(p["id"] for p in sdk.list_packs())
        raise ToolError(f"Unknown exam pack {pack!r}. Known packs: {known}.") from None
    except (RuntimeError, ValueError) as exc:
        # No key for live mode, bad thresholds: anticipated, tell the model why.
        raise ToolError(str(exc)) from exc
    log.info("exam done run=%s mode=%s verdict=%s breaches=%d", result["run_id"], result["mode"], result["verdict"], len(result["breaches"]))
    return result


@server.tool(
    name="assay_get_run",
    description="Fetch the verdict summary for a previously completed run by run_id (same shape as assay_run_exam).",
    annotations=_READ_ONLY,
)
def assay_get_run(
    run_id: str = Field(description="Run id returned by assay_run_exam, e.g. 'run_6b9a2c0a75'."),
) -> dict[str, Any]:
    result = sdk.get_run_result(run_id)
    if result is None:
        raise ToolError(f"Run {run_id!r} not found. Use assay_list_runs to see stored runs.")
    return result


@server.tool(
    name="assay_list_runs",
    description="List stored runs, newest first, with pagination (limit/offset).",
    annotations=_READ_ONLY,
)
def assay_list_runs(
    limit: int = Field(default=20, ge=1, le=100, description="Maximum runs to return."),
    offset: int = Field(default=0, ge=0, description="Runs to skip."),
) -> dict[str, Any]:
    return sdk.list_runs(limit=limit, offset=offset)


@server.tool(
    name="assay_refine_agent",
    description=(
        "Return a hardened rewrite of the agent definition grounded in a completed run: "
        "refined AGENTS.md markdown, strengths, gaps, and recommended sub-agents. "
        "Deterministic; no key needed."
    ),
    annotations=_READ_ONLY,
)
def assay_refine_agent(
    run_id: str = Field(description="Run id returned by assay_run_exam."),
    include_original: bool = Field(default=False, description="Include the original markdown alongside the rewrite."),
) -> dict[str, Any]:
    spec = sdk.refine_agent(run_id)
    if spec is None:
        raise ToolError(f"Run {run_id!r} not found or has no scorecard yet.")
    if not include_original:
        spec = {k: v for k, v in spec.items() if k != "original_markdown"}
    return spec


@server.tool(
    name="assay_get_proof_bundle",
    description=(
        "The portable proof bundle for a run: run record, candidate, scorecard, deployability "
        "decision and summary. Set include_events=true to add every recorded span (large)."
    ),
    annotations=_READ_ONLY,
)
def assay_get_proof_bundle(
    run_id: str = Field(description="Run id returned by assay_run_exam."),
    include_events: bool = Field(default=False, description="Include the full event span list."),
) -> dict[str, Any]:
    bundle = sdk.get_proof_bundle(run_id, include_events=include_events)
    if bundle is None:
        raise ToolError(f"Run {run_id!r} not found.")
    return bundle


@server.tool(
    name="assay_doctor",
    description=(
        "Report what this Assay installation can do: whether a live (behavioral) exam is "
        "possible, whether TraceRazor is installed, the database location, and the available packs."
    ),
    annotations=_READ_ONLY,
)
def assay_doctor() -> dict[str, Any]:
    return sdk.doctor()


def main(argv: list[str] | None = None) -> int:
    """Console entry point: ``assay-mcp [--db PATH]``."""
    import argparse

    parser = argparse.ArgumentParser(prog="assay-mcp", description="Run the Assay MCP server over stdio.")
    parser.add_argument("--db", help="SQLite file for persisted runs (default: $ASSAY_DB_PATH or a per-user path).")
    args = parser.parse_args(argv)
    path: Path = sdk.configure(args.db)
    log.info("assay-mcp %s ready; runs persist to %s; live exam %s", __version__, path, "available" if sdk.live_available() else "unavailable (no key)")
    server.run("stdio")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
