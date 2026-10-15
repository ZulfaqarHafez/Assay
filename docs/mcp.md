# Assay as a Python package and an MCP server

Assay's engine is importable, scriptable, and callable from any MCP client.
All three surfaces run the same code as the CLI and the web workspace.

## Install

```bash
# The MCP server as a container (GitHub Packages), nothing else to install:
docker pull ghcr.io/zulfaqarhafez/assay-mcp:latest
# Or the Python package from the GitHub Release:
pip install "assay[mcp,trace] @ https://github.com/ZulfaqarHafez/Assay/releases/download/v0.1.0/assay-0.1.0-py3-none-any.whl"
# Or from a checkout:
pip install -e "apps/api[mcp,dev]"
```

The import name is `assay_api`; the distribution name is `assay`. The `assay`
name on PyPI belongs to an unrelated project, so always install from the release
URL or a checkout, never with a bare `pip install assay`.

## Every exam is real

There is no stand-in grader. A real OpenAI model plays the agent definition
with its declared tools inside the sandbox, so every tool call is a genuine
model decision and the tripwires judge real behavior. Read these fields first:

| Field | Meaning |
| --- | --- |
| `exercised_model` | The model that played the agent, e.g. `openai:gpt-4.1` |
| `verdict` | `ship`, `probation`, or `do_not_ship` |
| `breaches` | Each tripwire hit, with the exact tool call quoted |
| `behavioral` | Always `true` for new runs; `false` only on legacy demo runs, which read as `unverified` |

Without a model key the exam does not run at all: the SDK raises
`ModelUnavailableError`, the MCP tool returns an error with setup instructions,
and nothing is recorded. Lint, packs, stored runs, refine, proof bundles, and
doctor all work without a key.

## Python SDK

```python
from assay_api import sdk

text = open("AGENTS.md").read()

# 1. No key: static lint of dangerous grants, missing guardrail language, secrets.
report = sdk.lint_agent(text, filename="AGENTS.md")
print(report["finding_counts"], report["dangerous_tools"])

# 2. The behavioral exam: a real model plays the agent (needs OPENAI_API_KEY).
result = sdk.run_exam(text, "AGENTS.md", pack="guardrail-v1", k=1, pass_threshold=0.8)
print(result["exercised_model"], result["verdict"])
for breach in result["breaches"]:
    print(breach["competency"], breach["tripwire"], breach["tool_call"])

# 3. Follow-ups on the stored run.
spec = sdk.refine_agent(result["run_id"])          # hardened AGENTS.md rewrite
bundle = sdk.get_proof_bundle(result["run_id"])    # portable proof bundle
```

`run_exam_async` is the coroutine form. Without a key both raise
`ModelUnavailableError` before recording anything.

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

With the container image instead of a Python install (Claude Desktop's
`claude_desktop_config.json` and Cursor use the same shape):

```json
{
  "mcpServers": {
    "assay": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "OPENAI_API_KEY", "-v", "assay-data:/data",
               "ghcr.io/zulfaqarhafez/assay-mcp:latest"],
      "env": { "OPENAI_API_KEY": "sk-..." }
    }
  }
}
```

The named volume keeps run history between sessions. Without a packaged
install, use `python -m assay_api.mcp_server` with `PYTHONPATH=apps/api`.

### Tools

| Tool | Needs a key | What it does |
| --- | --- | --- |
| `assay_lint_agent` | no | Static lint: dangerous tool grants, missing guardrail language per category, embedded secrets |
| `assay_list_exam_packs` | no | Packs and their competencies; the behavioral default is `guardrail-v1` |
| `assay_run_exam` | yes | Runs the adversarial exam; returns verdict, breaches with the exact tool call, privilege delta, scores |
| `assay_get_run` | no | Re-reads a stored run's verdict summary |
| `assay_list_runs` | no | Paginated run history |
| `assay_refine_agent` | no | Hardened rewrite of the agent definition grounded in a run |
| `assay_get_proof_bundle` | no | Portable proof bundle; `include_events` adds every span |
| `assay_doctor` | no | Whether the exam can run and why not, TraceRazor, database path, packs |

Exams take one to five minutes and spend model tokens. `k` multiplies
both. The server logs to stderr only.

### Suggested agent workflow

1. `assay_doctor` once, to learn whether the exam can run here.
2. `assay_lint_agent` on every draft; fix the high findings first.
3. `assay_run_exam` when the draft is stable; read `breaches` and
   `privilege_delta.removable` (tools the agent was granted but never needed).
4. `assay_refine_agent` for a rewrite, then re-run the exam on it.
