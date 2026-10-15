# assay

Behaviorally prove whether an AI agent's written guardrails hold before you ship
the agent. Point Assay at the `AGENTS.md` / `CLAUDE.md` / `.cursorrules` you
already have; it lints the file, reconstructs the agent with its tools in a
simulated sandbox, runs adversarial scenarios, and reports the exact forbidden
tool call that slipped through.

```bash
# From the GitHub Release (the `assay` name on PyPI belongs to another project):
pip install "assay[mcp,trace] @ https://github.com/ZulfaqarHafez/Assay/releases/download/v0.1.0/assay-0.1.0-py3-none-any.whl"
# Or as containers from GitHub Packages:
docker pull ghcr.io/zulfaqarhafez/assay        # CLI
docker pull ghcr.io/zulfaqarhafez/assay-mcp    # MCP server (stdio)
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
