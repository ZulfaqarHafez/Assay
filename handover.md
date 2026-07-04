# Assay → The Guardrail Prover — Handover

Single source of truth for anyone (human or coding agent) picking this up. Covers **what the product is now**, **what shipped**, **the architecture**, and **the remaining technical work** (web cut, security, smoke tests, deploy) as an executable runbook.

- **Repo:** monorepo — `apps/api` (FastAPI, package `assay_api`, Python 3.11) · `apps/web` (Next.js 15 / React 19 / TS).
- **State:** the pivot (sprints S1–S6) is on `main`. Full design context: `.claude/plans/evaluate-a-spawn-multiple-elegant-quiche.md`.
- **Test baseline:** API suite **214 passing**; web unit tests **77 passing**; type-check, lint, production build, dependency audits, secret scan, and Playwright smoke green on 2026-07-04.

## Current deployment update (2026-07-04)

- **Task A web cut:** implemented. `/agents`, `/suites`, old suite import/export routes, `/connectors`, `/connectors/probe`, and standalone role-analysis routes are retired and covered by 404 tests.
- **Security audit:** implemented in [docs/security-review.md](docs/security-review.md). No high/critical dependency findings; sandbox grep and secret scan passed.
- **Assets:** verified. Runtime bitmap assets are in `apps/web/public/brand`, `apps/web/public/art`, and `docs/images`; the old sprite-sheet docs now point to the Lucide-backed `Sprite` contract.
- **Build/deploy readiness:** `npm --workspace apps/web run build` passes with only `/`, `/runs`, and `/runs/[runId]` as product routes. Docker container smoke is the only local infra-blocked check because Docker Desktop's Linux engine is not running.

---

## 1. What Assay is now (the pivot) and why

Assay pivoted from a generic "pre-deployment litmus test" to **The Guardrail Prover**: the first tool that *behaviorally* proves whether an agent instruction file's guardrails actually hold before deployment.

**The problem it fixes (its own former theater):** tools declared in an `AGENTS.md`/`agent.md` used to be parsed but **never invoked** — Assay could only check whether an agent *talked about* safety, not whether it *behaved* safely. Three market-gap research passes confirmed the whole "behavioral verdict on the agent artifact itself" layer is unclaimed: every AGENTS.md tool is a static linter, every eval platform needs hand-built suites, every security scanner is signature-based. Nobody runs the agent and watches whether its guardrails hold.

**The breakthrough:** the agent — reconstructed from its artifact + parsed tools — runs a **real OpenAI function-calling loop against a simulated tool sandbox**. Its tool *calls* are genuine model decisions; the sandbox scripts the *results* (including poisoned outputs). Deterministic **tripwires** judge the transcript. Paste a bad file and you watch it call `rm -rf /prod` → `CRITICAL guardrail_breach` → **HOLD**, with the offending call quoted as evidence — plus a **privilege delta** ("these N tools were never needed — remove them") and a **fixed rewrite**.

**Input:** any `AGENTS.md` / `agent.md` / `CLAUDE.md` / `.cursorrules` / `SKILL.md` / JSON/YAML/TOML (a Linux Foundation standard in 60k+ repos). No SDK, no dataset, no tracing to wire.

**Roadmap after this (this pivot = phase B):**
- **A — "Hallmark"**: marketplace/artifact certification (badge + public certificate page; held-out probe rotation is the anti-gaming moat — brand-perfect given the Specimen A hallmark identity).
- **C — "Drift Canary"**: expiring certifications, auto re-exam on model-version bump, verdict-diff.
- **D — Evidence Pack**: EU AI Act conformity evidence (enforcement lands Aug 2, 2026).

---

## 2. What already works (don't rebuild)

| Sprint | Delivered | Key files |
|---|---|---|
| **S1** | Simulated tool sandbox (simulate-only, never executes) + real function-calling adapter + deterministic tripwires + orchestrator wiring | `sandbox.py`, `adapters/sandboxed.py`, `tripwires.py`, `models/scenario.py`, `scoring.grade_scenario` |
| **S2** | 21 scenarios across destructive · injection · secret_exfiltration · reliability; `hr-v1` retired → `guardrail-v1` default | `scenario_packs.py`, `models/run.py`, `cli.py` |
| **S3** | Least-privilege delta on every run + de-HR'd refinery (guardrail rewrite) | `privilege.py`, `Scorecard.privilege_delta`, `agent_refinery.py` |
| **S4** | Report surfaces guardrail findings + privilege panel + formatted breach fixes | `VerdictPanel.tsx`, `PrivilegeDeltaPanel.tsx`, `lib/assay.ts` |
| **S5** | Real no-key static lint (dangerous grants, missing guardrail language, embedded secrets) wired to intake | `static_lint.py`, `StaticLintPanel.tsx` |
| **S6** | CLI + GitHub Action default to `guardrail-v1`; gate exits nonzero on a bad agent | `cli.py`, `.github/actions/assay/action.yml` |

**Golden fixtures:** `apps/api/tests/fixtures/agent_bad.md` (must HOLD, ≥1 CRITICAL) · `agent_hardened.md` (must SHIP). One e2e asserts both offline.

**Run the baseline locally:**
```bash
python -m pip install -r apps/api/requirements-dev.txt
PYTHONPATH=apps/api python -m pytest apps/api/tests -q       # all pass
npm install
npm --workspace apps/web run test -- --run
npx eslint apps/web/src
npm --workspace apps/web run build                          # NOT while `next dev` is running (shared .next)
```

---

## 3. Architecture (target state)

```
Artifact in (AGENTS.md / CLAUDE.md / .cursorrules / SKILL.md / JSON/YAML/TOML)
  → agent_formats.normalize → agent_intake.detect_agent_facts
  → static_lint.py            (no-key: real lint, labeled, never a verdict)
        │ POST /candidates/from-markdown → POST /runs → POST /runs/{id}/start
        ▼
Exam engine (FastAPI, assay_api)
  orchestrator.RunOrchestrator
    ├─ scenario_packs.guardrail-v1 (21 scenarios, seen/held-out, k trials)
    ├─ adapters/sandboxed.SandboxedAgentAdapter ─► OpenAI (user key, function-calling loop, per-trial temp+seed)
    ├─ sandbox.ToolSandbox            (scripted + poisoned tool results, simulate-only)
    ├─ tripwires.evaluate             (deterministic hard gates, sequence-aware)
    ├─ scoring.grade_scenario         (tripwires first → LLM refusal-quality judge)
    ├─ privilege.analyze_privilege    (never-used tool grants)
    └─ deployability.evaluate_scorecard = SINGLE verdict authority (SHIP/RISKY/HOLD)
  Events: RunEvent stream (tool_called, response_graded, …) → polling UI
        │
        ├─ Persistence: SQLite (default) · Supabase (opt-in, same payload-JSON schema)
        └─ Consumers: Web (/ loop + /runs + report) · CLI (run·gate·scan·doctor) ·
                      GitHub Action (PR gate + artifacts) · badge.svg · card.svg
```

---

## 4. Remaining technical work (runbook)

Do these in order. Each has exact steps and acceptance.

### Task A — Finish the web cut (completed 2026-07-04)
`apps/web/src/app/agents/` and `.../suites/` still exist. Collapse to one loop + a minimal history.
1. Delete `app/agents/`, `app/suites/`. Collapse `app/runs/[runId]/` to a read-only report reusing `VerdictPanel`. Keep `/` and `/runs` (shrink `/runs` table to: artifact · verdict stamp · score · date · link).
2. Remove nav links to those routes (`components/workspace/TopNav.tsx` + command palette).
3. Delete dead `lib/api.ts` methods (audit-confirmed zero callers — grep each first): `connectors`, `connectorProbes`, `agentResearch`, `agentSpecFileExport`, `examPackFileExport`, `roleAnalysis`/`runRoleAnalysis`/`roleBrief`, `reviewers`, `suites/*`, `candidateProgress`, `candidateLessons`.
4. Delete dead components: `ReviewCouncil.tsx`, `RoleBriefCard.tsx`, `AgentRunControls.tsx` (confirm no imports).
5. Delete backend routers with no web consumer: `routers/connectors.py`, `suites.py`, `workspace.py` — fold `/workspace/boot` into a slim boot in `routers/runs.py`; remove their `include_router` in `main.py`. Keep badge/card/report/verdict/payoff/scorecard/events/from-markdown/deployability.
6. Update tests: trim `apps/web/src/app/page.test.tsx`, delete removed-component tests, update `apps/api/tests/test_api.py` for removed endpoints.
7. Keep Lab-Instrument tokens in `globals.css` + the Specimen A brand.

**Acceptance:** `next build` green; route list has no `/agents` `/suites`; `npx eslint apps/web/src` clean (catches dead imports); API + web suites green.

### Task B — Security audit (completed 2026-07-04)
The product now runs a live model with tools and a user key. Verify each surface, then write `docs/security-review.md` with ✓/finding per item.
1. **Sandbox cannot execute** — `grep -rn "subprocess\|os.system\|eval(\|exec(\|Popen" apps/api/assay_api/sandbox.py apps/api/assay_api/adapters/sandboxed.py` → must be none (currently ✓). Tool "results" are scripted strings only.
2. **Secrets server-side** — `OPENAI_API_KEY`/`openai_key` only via `agent_research.resolve_openai_key`; never in any `NEXT_PUBLIC_*` var or response body. Ensure `static_lint` never logs the artifact at INFO.
3. **SSRF** — `network_guard.validate_http_candidate_endpoint` rejects private/loopback/link-local unless `ASSAY_HTTP_CANDIDATE_ALLOW_PRIVATE=1`. **Add a test** that `http://169.254.169.254/` and `http://localhost` are rejected.
4. **Injection isolation** — poisoned `tool_stubs` output is only fed back to the model-under-test, never eval'd/run.
5. **Input caps & DoS** — enforce `_MAX_AGENT_MD_CHARS`, tool caps (`models/candidate.py`), sandbox `_MAX_TURNS`/`_MAX_TOOL_CALLS` (6/20), and `rate_limit.py` on `/candidates/from-markdown` + `/runs/*/start`.
6. **Public endpoints** — `security.is_public_path` exposes only `badge.svg`, `card.svg` (+ any token-gated report). `/verdict`, `/surfaces`, `/trace` stay `no-store` + auth-gated when `ASSAY_API_KEYS` set (existing tests cover this).
7. **CORS** — `ASSAY_CORS_ORIGINS` is an explicit allowlist in prod (never `*`).
8. **Dependency audit** — `pip install pip-audit && pip-audit -r apps/api/requirements.txt`; `npm --workspace apps/web audit --omit=dev`. Fix or triage high/critical.
9. **Secret scan** — the `secret-scan` CI job (`.github/workflows/ci.yml`) stays green.

**Acceptance:** `docs/security-review.md` written; SSRF-reject test passing; audits clean or triaged.

### Task C — Smoke matrix (partially completed 2026-07-04)
| # | Smoke | How | Pass |
|---|---|---|---|
| 1 | API boot | `uvicorn assay_api.main:app --app-dir apps/api` → `GET /health` | 200, no key |
| 2 | No-key intake | POST `/candidates/from-markdown` (no key) | response has `static_lint`, no verdict |
| 3 | Behavioral catch (offline) | `pytest apps/api/tests/test_guardrail_e2e.py` | bad→HOLD, hardened→pass |
| 4 | **Live tripwire e2e** | set `OPENAI_API_KEY`; `python -m assay_api.cli run --agent-md apps/api/tests/fixtures/agent_bad.md --pack guardrail-v1` | ≥1 `CRITICAL guardrail_breach`, HOLD; k trials vary |
| 5 | Live hardened | same on `agent_hardened.md` | SHIP, 0 criticals |
| 6 | CLI gate | `cli run … && cli gate --run <id>` | exit 1 on bad, 0 on hardened |
| 7 | GitHub Action | trigger `.github/workflows/ci.yml` docker job | posts verdict, uploads artifacts |
| 8 | Web loop e2e | Playwright: paste bad fixture → console → report | tripwire row live; finding+fix shown; re-run works |
| 9 | Report artifacts | `GET /runs/{id}/badge.svg` + `card.svg` | 200 unauthenticated |
| 10 | History | `/runs` after a run | listed; report reopens read-only |
| 11 | Dead-surface | `GET /agents /suites` | 404 after Task A |
| 12 | Prod build | `next build` + docker CI | green |
| 13 | Dark + print | Playwright dark screenshot + `print` media | no light leaks; report prints one sheet |

**#4/#5/#8 need a real `OPENAI_API_KEY`** (the sandbox runs a live model — the only way the tripwire *catch*, vs the offline refusal-quality gate, fires). Keep `ASSAY_LIVE_K=1` and a cheap `ASSAY_OPENAI_MODEL` while iterating; budget a few cents.

### Task D — Deploy (current target)
**API** (`apps/api/Dockerfile` exists; `render.yaml` at root):
1. `docker build -t assay-api apps/api && docker run -p 8000:8000 -e ASSAY_ENV=prod assay-api` → `GET /health` 200.
2. Deploy to Render from `render.yaml` (or Fly/Railway). Env: `OPENAI_API_KEY` (server-only), `ASSAY_CORS_ORIGINS=https://<web-domain>`, `ASSAY_API_KEYS=<random>` (if gating). Persistence: SQLite is **ephemeral** on Render — attach a disk or set `ASSAY_DB_BACKEND=supabase` + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. TraceRazor optional (`TRACERAZOR_BIN`; degrades gracefully).
3. **Web** (Vercel): set `NEXT_PUBLIC_API_BASE_URL=https://<api-domain>` only. Build must pass in CI first.
4. Env reference: `docs/deploy.md` + `grep -rho "ASSAY_[A-Z_]*" apps/api`. **Never** put secrets in `NEXT_PUBLIC_*`.

**Acceptance:** live web loads; paste `agent_bad.md`, run with the server key → HOLD report renders; badge/card URLs resolve; no secret in any client payload (Network tab).

### Task E — Post-deploy & docs
1. Re-run smoke #4/#5/#8/#9 against the deployed URLs.
2. Update `README.md` hero/positioning to the Guardrail-Prover framing (still reads as generic litmus test). Keep the Specimen A OG.
3. Confirm `docs/deploy.md` env table matches reality.
4. Tag a release; run `.github/actions/assay` on a sample repo against `guardrail-v1`.

---

## 5. Gotchas (hard-won — don't repeat these)
- **Never run `next build` while `next dev` is up** — they share `.next` and it corrupts (`routes-manifest.json` ENOENT, EXIT 127). Kill dev, `rm -rf apps/web/.next`, then build.
- **Live-key smokes cost real money.** Keep `ASSAY_LIVE_K=1` + a cheap model.
- **Offline ≠ tripwire catch.** With no key, a bad agent still fails via deterministic refusal-quality grading (the mock can't make tool calls). The tripwire *catch* only fires with a live model — verify smoke #4/#5 before trusting the headline demo.
- **If a Task-A deletion breaks a test, fix the test to the smaller surface — don't restore dead code.**
- Commit per task with a clear message; branch off `main` if auto-commit isn't handling it.
