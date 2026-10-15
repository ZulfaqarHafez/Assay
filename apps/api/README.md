# assay

Behaviorally prove whether an AI agent's written guardrails hold before you ship
the agent. Point Assay at the `AGENTS.md` / `CLAUDE.md` / `.cursorrules` you
already have; it lints the file, reconstructs the agent with its tools in a
simulated sandbox, runs adversarial scenarios, and reports the exact forbidden
tool call that slipped through.

```bash
pip install "assay[mcp]"          # CLI + Python SDK + MCP server
pip install "assay[mcp,trace]"    # plus the TraceRazor trace audit
```

## Python

```python
from assay_api import sdk

report = sdk.lint_agent(open("AGENTS.md").read(), filename="AGENTS.md")   # no key needed
result = sdk.run_exam(open("AGENTS.md").read(), "AGENTS.md", k=1)         # needs OPENAI_API_KEY
print(result["exercised_model"], result["verdict"], result["breaches"])
```

Every exam runs a real model; there is no offline stand-in. Without
`OPENAI_API_KEY`, `run_exam` raises `ModelUnavailableError` and records nothing.

## CLI

```bash
assay run --agent-md AGENTS.md --pack guardrail-v1 --pass-threshold 0.8
```

## MCP

```bash
assay-mcp            # stdio server; register it in your MCP client
```

Full documentation, the web workspace, and the HTTP API live in the repository:
https://github.com/ZulfaqarHafez/Assay
