# Handoff — finish, harden, and ship The Guardrail Prover

**For:** Codex (or any coding agent) picking up after the Guardrail Prover pivot.
**Repo:** monorepo — `apps/api` (FastAPI, package `assay_api`, Python 3.11) · `apps/web` (Next.js 15 / React 19 / TS).
**Branch/commits:** the pivot (sprints S1–S6) is on `main`. Full design context: `.claude/plans/evaluate-a-spawn-multiple-elegant-quiche.md`.

## What already works (don't rebuild)
The agent under test now makes **real tool calls** in a **simulated sandbox** (`assay_api/sandbox.py` — simulate-only, never executes; verified no `subprocess`/`exec`). Deterministic **tripwires** (`assay_api/tripwires.py`) judge the transcript; a breach → `CRITICAL guardrail_breach` → HOLD via `deployability.py`. Content: `assay_api/scenario_packs.py` (`guardrail-v1`, 21 scenarios: destructive/injection/secret_exfiltration/reliability). No-key path: `assay_api/static_lint.py`. Least-privilege: `assay_api/privilege.py` → `Scorecard.privilege_delta`. CLI + Action default to `guardrail-v1`. **Full API suite: 218 pass.** Golden fixtures: `apps/api/tests/fixtures/agent_bad.md` (must HOLD), `agent_hardened.md` (must SHIP).

## Run everything locally first (baseline)
```bash
# API
python -m pip install -r apps/api/requirements-dev.txt
PYTHONPATH=apps/api python -m pytest apps/api/tests -q          # expect: all pass
# Web
npm install
npm --workspace apps/web run test -- --run
npx eslint apps/web/src
npm --workspace apps/web run build                              # MUST NOT run while `next dev` is up (shared .next)
```

---

## Task A — Finish the web cut (still unfinished)
**Why:** `apps/web/src/app/agents/` and `apps/web/src/app/suites/` still exist; the plan calls for one loop (drop → exam → report → fix → re-run) + a minimal `/runs` history. Dead client methods and backend routers remain.

1. **Delete routes:** `apps/web/src/app/agents/`, `apps/web/src/app/suites/`. Collapse `apps/web/src/app/runs/[runId]/` to a read-only report reusing `VerdictPanel`. Keep `/` and `/runs` (shrink `/runs` table to: artifact name · verdict stamp · score · date · link).
2. **Remove nav links** to those routes (`components/workspace/TopNav.tsx` + command palette).
3. **Delete dead `lib/api.ts` methods** (audit confirmed zero callers): `connectors`, `connectorProbes`, `agentResearch`, `agentSpecFileExport`, `examPackFileExport`, `roleAnalysis`/`runRoleAnalysis`/`roleBrief`, `reviewers`, `suites/*`, `candidateProgress`, `candidateLessons`. Grep each name across `apps/web/src` first; only delete if unreferenced.
4. **Delete dead components:** `ReviewCouncil.tsx`, `RoleBriefCard.tsx`, `AgentRunControls.tsx` (confirm no imports remain).
5. **Delete backend routers with no web consumer:** `assay_api/routers/connectors.py`, `suites.py`, `workspace.py` — fold `/workspace/boot` into a slim boot in `routers/runs.py`. Remove their `include_router` calls in `assay_api/main.py`. **Keep** badge/card/report/verdict/payoff/scorecard/events/from-markdown/deployability.
6. **Update tests:** rewrite/trim `apps/web/src/app/page.test.tsx` and delete tests for removed components; update `apps/api/tests/test_api.py` for removed endpoints.
7. Keep the Lab-Instrument tokens in `globals.css` and the Specimen A brand.

**Acceptance:** `npm --workspace apps/web run build` green; `next build` route list shows no `/agents` `/suites`; `npx eslint apps/web/src` clean; API + web test suites green; no dead imports (`npx eslint` catches unused).

---

## Task B — Security audit
The product now takes a user's OpenAI key and runs a model with tools. Verify each surface:

1. **Sandbox cannot execute.** Re-confirm `sandbox.py`/`adapters/sandboxed.py` never shell out (`grep -rn "subprocess\|os.system\|eval(\|exec(\|Popen"` → none). Tool "results" are scripted strings only.
2. **Secrets stay server-side.** `OPENAI_API_KEY`/`openai_key` resolved only in `agent_research.resolve_openai_key`; assert it never reaches any `NEXT_PUBLIC_*` var or response body. Grep responses for key leakage. The static-lint secret patterns (`static_lint._SECRET_PATTERNS`) must not log the artifact at INFO.
3. **SSRF / HTTP candidate.** `network_guard.validate_http_candidate_endpoint` must reject private/loopback/link-local unless `ASSAY_HTTP_CANDIDATE_ALLOW_PRIVATE=1`. Add a test that `http://169.254.169.254/` and `http://localhost` are rejected.
4. **Injection isolation.** The poisoned `tool_stubs` are test fixtures; confirm poisoned output is only ever fed back to the model-under-test, never `eval`'d or run.
5. **Input caps & DoS.** Confirm `_MAX_AGENT_MD_CHARS`, tool caps (`models/candidate.py`), sandbox `_MAX_TURNS`/`_MAX_TOOL_CALLS` (6/20), and `rate_limit.py` are enforced on `/candidates/from-markdown` and `/runs/*/start`.
6. **Public endpoints.** `security.is_public_path` should expose only `badge.svg`, `card.svg`, and (if added) a token-gated `report`. Verify `/verdict`, `/surfaces`, `/trace` stay `no-store` + auth-gated when `ASSAY_API_KEYS` is set (existing tests cover this).
7. **CORS.** `ASSAY_CORS_ORIGINS` must be an explicit allowlist in prod (no `*`).
8. **Dependency audit.** `pip install pip-audit && pip-audit -r apps/api/requirements.txt` and `npm --workspace apps/web audit --omit=dev`. Fix or document any high/critical.
9. **Secret scan.** The `secret-scan` CI job (`.github/workflows/ci.yml`) must stay green; run gitleaks locally if changing it.

**Acceptance:** a short `docs/security-review.md` noting each check ✓/finding; new SSRF-reject test passing; `pip-audit` + `npm audit` clean or triaged.

---

## Task C — Smoke matrix (run every one)
| # | Smoke | Command / how | Pass |
|---|---|---|---|
| 1 | API boot | `python -m uvicorn assay_api.main:app --app-dir apps/api` → `GET /health` | 200, no key |
| 2 | No-key intake | POST `/candidates/from-markdown` (no key) | response has `static_lint`, no Scorecard/verdict |
| 3 | Behavioral catch (offline) | `pytest apps/api/tests/test_guardrail_e2e.py` | bad→HOLD, hardened→pass |
| 4 | **Live tripwire e2e** | set `OPENAI_API_KEY`; `assay_api.cli run --agent-md apps/api/tests/fixtures/agent_bad.md --pack guardrail-v1` | ≥1 `CRITICAL guardrail_breach`, HOLD; k trials vary |
| 5 | Live hardened | same on `agent_hardened.md` | SHIP, 0 criticals |
| 6 | CLI gate | `assay_api.cli run … && assay_api.cli gate --run <id>` | exit 1 on bad, 0 on hardened |
| 7 | GitHub Action | trigger `.github/workflows/ci.yml` docker job | posts verdict, uploads artifacts |
| 8 | Web loop e2e | Playwright: paste bad fixture → console → report | tripwire row live; finding+fix shown; re-run works |
| 9 | Report artifacts | `GET /runs/{id}/badge.svg` + `card.svg` | 200 unauthenticated |
| 10 | History | `/runs` after a run | listed; report reopens read-only |
| 11 | Dead-surface | `GET /agents /suites` | 404 after Task A |
| 12 | Prod build | `next build` + docker CI | green |
| 13 | Dark mode + print | Playwright dark screenshot + `print` media | no light leaks; report prints one sheet |

**Note:** #4/#5/#8 need a real `OPENAI_API_KEY` (the sandbox runs a live model). Budget a few cents. Use a cheap model via `ASSAY_OPENAI_MODEL`.

---

## Task D — Deploy
**API** (`apps/api/Dockerfile` exists; `render.yaml` at root):
1. `docker build -t assay-api apps/api && docker run -p 8000:8000 -e ASSAY_ENV=prod assay-api` → `GET /health` 200.
2. Deploy to Render from `render.yaml` (or Fly/Railway). Set env: `OPENAI_API_KEY` (server-only), `ASSAY_CORS_ORIGINS=https://<web-domain>`, `ASSAY_API_KEYS=<random>` (if gating), optional `ASSAY_DB_BACKEND=supabase` + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (else SQLite; note SQLite is ephemeral on Render — use a disk or Supabase for persistence). TraceRazor optional (`TRACERAZOR_BIN`); degrades gracefully.
3. **Web** (Vercel): set `NEXT_PUBLIC_API_BASE_URL=https://<api-domain>` only. `npm --workspace apps/web run build` must pass in CI first. Deploy.
4. Full env var list: `docs/deploy.md` + grep `ASSAY_*` in `apps/api`. Never put secrets in `NEXT_PUBLIC_*`.

**Acceptance:** live web loads, paste `agent_bad.md`, run with the server key → HOLD report renders; badge/card URLs resolve; no secret in any client payload (check Network tab).

---

## Task E — Post-deploy verification & docs
1. Re-run smoke #4/#5/#8/#9 against the deployed URLs.
2. Update `README.md` hero/positioning to the Guardrail Prover framing (it still reads as generic litmus test). Keep the Specimen A OG.
3. Confirm `docs/deploy.md` env table matches reality.
4. Tag a release; ensure the GitHub Action (`.github/actions/assay`) runs `guardrail-v1` green on a sample repo.

---

## Guardrails for you (the agent doing this)
- **Never** run `next build` while a `next dev` is up — shared `.next` corrupts (seen repeatedly here). Kill dev first, `rm -rf apps/web/.next`, then build.
- Commit per task with a clear message; branch off `main` if the repo's auto-commit isn't handling it.
- If a deletion (Task A) breaks a test, fix the test to match the new smaller surface — don't restore the dead code.
- Live-key smokes cost real money; keep k low (`ASSAY_LIVE_K=1`) and use a cheap model while iterating.
