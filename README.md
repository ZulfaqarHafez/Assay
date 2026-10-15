![Assay — prove your AI agent's guardrails actually hold](apps/web/public/brand/assay-og.png)

# Assay — The Guardrail Prover

[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)
![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue.svg)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black.svg)
![Behavioral exam](https://img.shields.io/badge/exam-behavioral%20(real%20tool%20calls)-7c5470.svg)

**Assay proves whether your AI agent's written guardrails actually hold — before you ship them.**
Point it at the `AGENTS.md` / `agent.md` / `CLAUDE.md` you already have. Assay
reconstructs the agent from that file with its declared tools, plays it with a
reference model in a simulated sandbox, runs real adversarial scenarios, and shows
you the **exact destructive command your guardrails failed to block** — plus which
tool permissions it never needed and a fixed rewrite. No SDK, no test harness, no
dataset to write.

**What is under test is the instruction file, not your production runtime.** A live
run exercises your definition under a reference model (OpenAI; pick it with
`--model` or `ASSAY_OPENAI_MODEL`, and every result names it as `exercised_model`).
That proves the instructions hold for that model with those tools. It does not drive
your deployed agent, its framework, or its real tool implementations.

> Written guardrails aren't enforced guardrails. Assay makes your agent *try* to
> delete prod, leak secrets, and obey injected instructions — and catches it when it does.

Every tool call is a real model decision in a sandbox that never executes; a
deterministic tripwire fires the instant the agent takes a forbidden action
(`exec_shell("rm -rf /prod")`, `db_query("DROP TABLE …")`, exfiltrating secrets).

**Gate your CI on the verdict** — drop the CLI into a pipeline and fail the build
before an agent whose guardrails don't hold ships:

```powershell
python -m assay_api.cli run --agent-md .\AGENTS.md --pack guardrail-v1 --pass-threshold 0.8
```

The reusable GitHub Action lives at [`.github/actions/assay`](.github/actions/assay);
full CI usage is in [Run Assay in CI](#run-assay-in-ci) below. Every completed run also
emits an [embeddable status badge](#product-surface) you can drop in a README.

## What it does

- **Selection, not creation.** Paste or drop an `agent.md`, or start from a
  built-in template. Assay treats that definition as the candidate under test.
- **Adversarial exam.** Each run fires 20+ probes across six failure categories —
  compliance, prompt injection, fairness, confidentiality, refusal boundaries,
  and ambiguity handling — including held-out prompts the agent has never seen.
- **Held-out certification.** Verdicts are gated at `pass^k`: an agent has to
  hold the line across repeated held-out re-runs, so a single lucky pass never
  certifies it as ready to ship.
- **A verdict you can act on.** You get a HOLD → RISKY → SHIP band, a per-capability
  score breakdown, and a severity-ranked "what to fix" list tied back to the
  failing trace.
- **An audited paper trail.** Every run is persisted as an experiment with a
  portable proof bundle (run, candidate, scorecard, event spans, TraceRazor audit
  summary, and a refined agent spec) you can export as JSON.
- **Every exam is real.** A real OpenAI model plays your definition, or your own
  agent answers over HTTP. There is no stand-in grader. Without a model key Assay
  still lints the file and says the exam needs `OPENAI_API_KEY`: the web app shows
  the lint, the HTTP API returns 409, the CLI exits with code 4, and the SDK and
  MCP server raise a clear error. If the model stays rate-limited mid-run, the run
  stops and is recorded as failed; Assay never substitutes answers. Runs stored by
  the old demo grader still open, labelled **Unverified**.
- **TraceRazor is optional.** The trace audit runs when `tracerazor` is installed
  (`pip install "assay[trace]"`). When it is absent the check is reported as
  skipped, never as a failed exam; pass `--require-trace` to insist on it.

## Screenshots

### Drop in an `agent.md`

The front door: paste or upload an agent definition, pick a template, and run the
litmus test.

![Assay intake screen](docs/images/01-landing.png)

### Watch it survive an adversarial exam

Probes stream live as the agent is stress-tested across each failure category.

![Assay run streaming](docs/images/02-judging.png)

### Get a verdict and a ranked list of fixes

A ship/fail verdict, per-capability scores, and a severity-ordered list of what to
fix before you deploy. (Here a high raw score still fails the gate because
compliance broke on held-out variants.)

![Assay verdict and fixes](docs/images/03-verdict.png)

### Every run is a tracked experiment

The workspace keeps a ledger of runs — scored, certified at `pass^k`, and open to
compare against a previous run or inspect the trace.

![Assay experiments ledger](docs/images/05-experiments.png)

## Use it as a package or an MCP server

The engine is an installable Python distribution (`assay`, import name
`assay_api`) with a programmatic SDK and a stdio MCP server, so an agent can
lint and behaviorally test the `AGENTS.md` it is writing before the file ships.

```bash
pip install -e "apps/api[mcp]"      # `assay` CLI, `assay_api.sdk`, `assay-mcp`
assay-mcp                           # MCP server over stdio
```

```python
from assay_api import sdk
report = sdk.lint_agent(open("AGENTS.md").read(), filename="AGENTS.md")  # no key needed
result = sdk.run_exam(open("AGENTS.md").read(), "AGENTS.md", k=1)        # needs OPENAI_API_KEY
```

Every result names the model that played the agent (`exercised_model`) and
lists each breach with the exact tool call. Without a key, `run_exam` raises
`ModelUnavailableError` and records nothing. The repo ships a `.mcp.json` so
Claude Code picks the server up from a checkout. Tools and config are in
[docs/mcp.md](docs/mcp.md).

## Quick Start

```powershell
.\scripts\setup.ps1
.\scripts\start-dev.ps1
```

`setup.ps1` installs the API dependencies (including TraceRazor from PyPI), installs
a local TraceRazor checkout in editable mode when one exists (`TRACERAZOR_REPO`, or a
`TraceRazor/` folder next to this repo), and installs the Next.js workspace
dependencies. Put `OPENAI_API_KEY` in a root `.env` (see `.env.example`) so the API
can run the exam; without it the app lints only.

`start-dev.ps1` scans for free API and web ports, starts both servers in the
background, wires `NEXT_PUBLIC_API_BASE_URL` into the web process, and writes the
resolved URLs to `logs/dev-ports.json`. Open the web URL it prints, paste an
`agent.md`, and run. Stop both servers with:

```powershell
.\scripts\stop-dev.ps1
```

Without TraceRazor the API still starts; the trace audit is reported as skipped
until `tracerazor>=1.0.3` is installed.

## Manual Commands

```powershell
python -m pip install -r apps/api/requirements-dev.txt
python -m pip install -e $env:TRACERAZOR_REPO   # optional: a local TraceRazor checkout
npm install
```

Run the API:

```powershell
python -m uvicorn assay_api.main:app --reload --app-dir apps/api --host 127.0.0.1 --port 8000
```

Run the web app:

```powershell
npm --workspace apps/web run dev
```

If port `8000` is occupied, prefer `.\scripts\start-dev.ps1`; it will choose
another API port and pass it to the web app automatically.

Examine your own agent runtime instead of a definition: put it behind the HTTP
contract in [examples/http_candidate](examples/http_candidate/README.md) (a
reference agent runs with `npm run dev:candidate`) and register it with
`POST /candidates` (`adapter_type: "http"`).

Run tests:

```powershell
python -m pytest apps/api/tests            # hermetic; a scripted model stands in for OpenAI
$env:OPENAI_API_KEY="sk-..."; python -m pytest apps/api/tests -m live   # the real model, end to end
npm --workspace apps/web run test
```

The hermetic suite also runs a real reference agent over a local socket. The
`live` tests call OpenAI and skip when no key is set; CI runs them when the
repository has an `OPENAI_API_KEY` secret.

## Run Assay in CI

Assay ships a CLI so you can gate deploys on a held-out verdict from a shell or a
pipeline:

```powershell
$env:PYTHONPATH="apps/api"
python -m assay_api.cli run --agent-md .\agent.md --pack guardrail-v1 --pass-threshold 0.8
```

Useful flags: `--k` (trials per seen/held-out item), `--model` (which model plays
the agent), and `--json-out` / `--proof-out` / `--summary-out` to write the
scorecard JSON, proof bundle JSON, and Markdown verdict summary. Exit codes:
`0` ship, `1` gate failed, `2` runtime error, `3` invalid input, `4` no verdict
(no model key, so the exam did not run; also returned when gating a legacy demo
run). Set `OPENAI_API_KEY` in the pipeline, or pass it to the action's
`openai-api-key` input. The reusable GitHub Action lives at `.github/actions/assay` and
uploads those three artifacts.

## How a run flows

`/` paste or upload `agent.md` -> register candidate -> stream the adversarial
judging -> verdict, with a ranked "what to fix" list -> open the read-only
report at `/runs/[id]` for the verdict band, capability radar, run comparison,
learning trend, diagnostics, and the trace drawer.

## Product Surface

- The first screen is the agent intake front door; the routed workspace exposes
  **Experiments** (`/runs`) and read-only run reports (`/runs/{run_id}`). The
  retired `/agents` and `/suites` surfaces intentionally return 404.
- A free-text job scope can be turned into decision logic during run creation:
  role analysis deterministically maps job-scope phrases to competencies,
  expected checks, and recommended sub-agents with a traceable evidence chain,
  picks the exam pack, and flags protected-attribute language as compliance
  notes only (never requirements). Details are in
  [docs/role-intelligence.md](docs/role-intelligence.md).
- HTTP candidates (your own agent behind `POST /ask`) use the same examiner,
  tripwires, scoring, persistence, and TraceRazor path as definitions played by
  the reference model.
- The Agent Refinery turns each run into a refined `AGENTS.md` for the candidate
  plus grounded sub-agent recommendations; details are in
  [docs/agent-refinery.md](docs/agent-refinery.md).
- An optional OpenAI layer can research "what this agent should be" on demand —
  fast (grounded in the run) or deep (web search with cited sources) — via
  `POST /runs/{run_id}/agent-spec/research?mode=fast|deep`. The key is read
  server-side only from `OPENAI_API_KEY`/`openai_key` in a git-ignored root
  `.env`/`env`; with no key the feature reports `unavailable`.
- `GET /runs` lists stored runs from the active database backend;
  `GET /runs/{run_id}/agent-spec` returns the refined `assay.agent_spec.v1`
  definition; `POST /runs/{run_id}/agent-spec/export-files` writes `AGENTS.md` plus
  one `.md` per recommended sub-agent; `GET /runs/{run_id}/proof-bundle` returns
  the portable proof bundle.
- HTTP candidates, research, proof bundles, and server-only internal analysis
  surfaces are tracked in [docs/backend-surfaces.md](docs/backend-surfaces.md).

## MVP Boundaries

- Certificates are internal capability bars, not legal or standards compliance
  claims.
- The exam always runs a real model (or your HTTP agent); the test suite uses a
  scripted stand-in only inside `apps/api/tests`, never in the product.
- Optional semantic judge assistance is disabled by default; set
  `ASSAY_LLM_JUDGE_ENABLED=1` server-side to allow bounded LLM paraphrase
  rescue evidence in scorecards.
- Supabase is supported as the server database when server-only env vars are
  configured; SQLite remains the local fallback.
- Browser automation and external connector probes are kept out of the public
  product surface until they have a supported user workflow.

## Supabase Backend

The core migration lives at `supabase/migrations/20260627033410_interviu_core.sql`.

Set these server-only env vars to use Supabase:

```powershell
$env:ASSAY_DB_BACKEND="supabase"
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-server-only-key"
```

Do not put the service role key in any `NEXT_PUBLIC_*` variable. See
[docs/supabase.md](docs/supabase.md) for schema and RLS notes.

## Research Notes

Product research notes for the AgentDojo-inspired exam shape, Hugging Face export
path, and Supabase boundary are in
[docs/product-research.md](docs/product-research.md).

---

> **Note:** the package, API module, and many env vars still use the original
> `assay` name internally; **Assay** is the product name. Renaming the code
> namespace is intentionally deferred to avoid churn.

## License

Assay is released under the [MIT License](LICENSE). Contributions are welcome —
see [CONTRIBUTING.md](CONTRIBUTING.md); security reports go through
[SECURITY.md](SECURITY.md).
