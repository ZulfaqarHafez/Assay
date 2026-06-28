# Interviu

Interviu is a local agent interview evaluation workspace. It runs candidate agents through HR-focused adversarial interview rounds, scores reliability on held-out variants, and uses TraceRazor as the audit and proof layer for candidate-only traces.

## Local Setup

```powershell
.\scripts\setup.ps1
.\scripts\start-dev.ps1
```

The setup script installs the FastAPI dependencies, tries to install the sibling TraceRazor checkout at `C:\Users\zulfa\TraceRazor` in editable mode, and installs the Next.js workspace dependencies.

The dev launcher scans for free API and web ports, starts both servers in the background, wires `NEXT_PUBLIC_API_BASE_URL` into the web process, and writes the resolved URLs to `logs/dev-ports.json`. Stop them with:

```powershell
.\scripts\stop-dev.ps1
```

If the sibling checkout is unavailable, the API still starts and will report TraceRazor as unavailable until you install `tracerazor>=1.0.3`.

## Manual Commands

```powershell
python -m pip install -r apps/api/requirements-dev.txt
python -m pip install -e C:\Users\zulfa\TraceRazor
npm install
```

Run the API:

```powershell
python -m uvicorn interviu_api.main:app --reload --app-dir apps/api --host 127.0.0.1 --port 8000
```

Run the web app:

```powershell
npm --workspace apps/web run dev
```

If port `8000` is occupied, prefer `.\scripts\start-dev.ps1`; it will choose another API port and pass it to the web app automatically.

Run the example HTTP candidate:

```powershell
npm run dev:candidate
```

Register it in the web app with `http://127.0.0.1:8080/ask`.

Run tests:

```powershell
python -m pytest apps/api/tests
npm --workspace apps/web run test
```

Run Assay from CI or a local shell:

```powershell
$env:PYTHONPATH="apps/api"
python -m interviu_api.cli run --agent-md .\agent.md --pack hr-v1 --pass-threshold 0.8
```

The reusable GitHub Action lives at `.github/actions/assay` and uploads the
scorecard JSON, proof bundle JSON, and Markdown verdict summary.

## Product Surface

- The first screen is the evaluation workspace with run setup, score, proof, a candidate room, and the agent panel.
- The arena spawns the full interview cast as pixel sprites — examiner, judge panel, lesson library, TraceRazor auditor, and simulator — that activate during a run alongside the candidate.
- A free-text job scope can be turned into decision logic: role analysis deterministically maps job-scope phrases to competencies, expected checks, and recommended sub-agents with a traceable evidence chain, picks the exam pack, and flags protected-attribute language as compliance notes only (never requirements). Available via `POST /role-analysis`, `GET /runs/{run_id}/role-analysis`, and embedded in the proof bundle; details are in [docs/role-intelligence.md](docs/role-intelligence.md).
- The pixel sprite system now spans four sheets — the `dojo` character sheet plus dedicated `judging`, `lessons`, and `runs` state sheets that drive the roster judge verdict, lessons-library growth, and recent-runs status glyphs — and is extended or regenerated through the `sprite-generator` skill; details are in [docs/sprites.md](docs/sprites.md).
- Advanced details such as exam export, previous runs, connector probes, and trace spans stay collapsed until needed.
- Suite import/export, role analysis, HTTP candidates, research, and server-only
  connector surfaces are tracked in [docs/backend-surfaces.md](docs/backend-surfaces.md).
- HTTP candidates can be registered from the web app and use the same examiner, scoring, persistence, and TraceRazor path as mock candidates.
- The Agent Refinery turns each run into a refined `AGENTS.md` for the candidate plus grounded sub-agent recommendations; details are in [docs/agent-refinery.md](docs/agent-refinery.md).
- An optional OpenAI layer can research "what this agent should be" on demand — fast (grounded in the run) or deep (web search with cited sources) — via `POST /runs/{run_id}/agent-spec/research?mode=fast|deep`. The key is read server-side only from `OPENAI_API_KEY`/`openai_key` in a git-ignored root `.env`/`env`; with no key the feature reports `unavailable` and the rest of Interviu keeps working offline.
- `GET /runs` lists stored runs from the active database backend.
- `GET /runs/{run_id}/agent-spec` returns the refined `interviu.agent_spec.v1` agent definition, and `POST /runs/{run_id}/agent-spec/export-files` writes `AGENTS.md` plus one `.md` per recommended sub-agent.
- `GET /runs/{run_id}/proof-bundle` returns a portable JSON bundle with the run, candidate, scorecard, event spans, TraceRazor summary, refined agent spec, database health, and connector probes.
- The web app can load a previous run from the ledger and export the current proof bundle as JSON.

## MVP Boundaries

- Certificates are internal capability bars, not legal or standards compliance claims.
- Mock grading is deterministic development mode.
- Optional semantic judge assistance is disabled by default; set
  `INTERVIU_LLM_JUDGE_ENABLED=1` server-side to allow bounded LLM paraphrase
  rescue evidence in scorecards.
- Supabase is supported as the server database when server-only env vars are configured; SQLite remains the local fallback.
- MCP, OpenAI-compatible, Hugging Face, Vercel agent-browser, and local-command connectors are registry-ready, with active adapters added incrementally.

## Supabase Backend

The migration lives at `supabase/migrations/20260627031004_interviu_core.sql`.

Set these server-only env vars to use Supabase:

```powershell
$env:INTERVIU_DB_BACKEND="supabase"
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-server-only-key"
```

Do not put the service role key in any `NEXT_PUBLIC_*` variable. See [docs/supabase.md](docs/supabase.md) for schema and RLS notes.

## Product Connectors

Interviu exposes connector readiness through `GET /connectors` and the UI connector rail. Current connector notes are in [docs/connectors.md](docs/connectors.md).

Product research notes for the AgentDojo-inspired exam shape, Hugging Face export path, and Supabase boundary are in [docs/product-research.md](docs/product-research.md).

## Pixel Sprites

The web app uses a project-local pixel sprite sheet at `apps/web/public/sprites/interviu-dojo-sprites.svg`. A generated concept sheet is saved beside it for future art direction. Details are in [docs/sprites.md](docs/sprites.md).
