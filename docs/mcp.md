# Assay as a Python package and an MCP server

Assay's engine is importable, scriptable, and callable from any MCP client.
All three surfaces run the same code as the CLI and the web workspace.

## Install

```bash
pip install "assay[mcp]"            # CLI (`assay`), SDK (`assay_api.sdk`), MCP server (`assay-mcp`)
pip install "assay[mcp,trace]"      # plus the TraceRazor trace audit
pip install -e "apps/api[mcp,dev]"  # from a checkout
```

The import name is `assay_api` for now; the distribution name is `assay`.

## What is honest about the results

Every exam result carries three fields you should read before anything else:

| Field | Meaning |
| --- | --- |
| `mode` | `live` (a real model made the tool calls inside the sandbox) or `mock` (deterministic demo grader, no model) |
| `behavioral` | `true` only in live mode |
| `verdict` | `ship`, `probation`, `do_not_ship` in live mode; the literal `demo-only` in mock mode |

A mock run is useful to check plumbing, packs, and persistence. It cannot
catch a guardrail breach because no tool call is ever made, so the SDK never
reports a mock run as deployable (`deployable` is `null`) and attaches a
warning explaining why. Live mode needs `OPENAI_API_KEY` in the environment
or a root `.env`.

## Python SDK

```python
from assay_api import sdk

text = open("AGENTS.md").read()

# 1. No key: static lint of dangerous grants, missing guardrail language, secrets.
report = sdk.lint_agent(text, filename="AGENTS.md")
print(report["finding_counts"], report["dangerous_tools"])

# 2. The behavioral exam (live when a key exists, else mock).
result = sdk.run_exam(text, "AGENTS.md", pack="guardrail-v1", k=1, pass_threshold=0.8)
print(result["mode"], result["verdict"])
for breach in result["breaches"]:
    print(breach["competency"], breach["tripwire"], breach["tool_call"])

# 3. Follow-ups on the stored run.
spec = sdk.refine_agent(result["run_id"])          # hardened AGENTS.md rewrite
bundle = sdk.get_proof_bundle(result["run_id"])    # portable proof bundle
```

`run_exam_async` is the coroutine form. `mode="live"` fails fast without a
key; `mode="mock"` forces the demo grader.

**What a live run tests.** The definition, reconstructed with its declared
tools and played by a reference model inside the sandbox. Pick the model with
`model=` (an OpenAI model id), else `ASSAY_OPENAI_MODEL`, else the adapter
default. Every result names it in `exercised_model` and spells it out in
`tested`. It is not a test of your production runtime, framework, or real tool
implementations; it proves the instructions hold for that model with those
tools.

**TraceRazor is optional.** `require_trace=None` (the default) blocks only on
a trace audit that ran and failed; when TraceRazor is not installed the check
is listed in `skipped_checks` with a warning and never fails the exam.
`require_trace=True` insists it is installed and passes; `False` makes it
advisory.

Runs persist to SQLite at `$ASSAY_DB_PATH`, or
`$XDG_DATA_HOME/assay/assay.db` (default `~/.local/share/assay/assay.db`).
Pass `db_path=` to any SDK call or `sdk.configure(path)` once to override.

## MCP server

`assay-mcp` speaks MCP over stdio. Register it with your client.

Claude Code (the repo ships this as `.mcp.json`):

```json
{
  "mcpServers": {
    "assay": {
      "command": "assay-mcp",
      "env": { "OPENAI_API_KEY": "${OPENAI_API_KEY}" }
    }
  }
}
```

Claude Desktop (`claude_desktop_config.json`) and Cursor use the same shape.
Without a packaged install, use `python -m assay_api.mcp_server` with
`PYTHONPATH=apps/api` instead of `assay-mcp`.

### Tools

| Tool | Needs a key | What it does |
| --- | --- | --- |
| `assay_lint_agent` | no | Static lint: dangerous tool grants, missing guardrail language per category, embedded secrets |
| `assay_list_exam_packs` | no | Packs and their competencies; the behavioral default is `guardrail-v1` |
| `assay_run_exam` | for live | Runs the adversarial exam; returns verdict, breaches with the exact tool call, privilege delta, scores |
| `assay_get_run` | no | Re-reads a stored run's verdict summary |
| `assay_list_runs` | no | Paginated run history |
| `assay_refine_agent` | no | Hardened rewrite of the agent definition grounded in a run |
| `assay_get_proof_bundle` | no | Portable proof bundle; `include_events` adds every span |
| `assay_doctor` | no | What this install can do: live exam, TraceRazor, database path, packs |

Live exams take one to five minutes and spend model tokens. `k` multiplies
both. The server logs to stderr only.

### Suggested agent workflow

1. `assay_doctor` once, to learn whether a live exam is possible.
2. `assay_lint_agent` on every draft; fix the high findings first.
3. `assay_run_exam` when the draft is stable; read `breaches` and
   `privilege_delta.removable` (tools the agent was granted but never needed).
4. `assay_refine_agent` for a rewrite, then re-run the exam on it.
