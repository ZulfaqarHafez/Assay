# Deploying Assay

Assay is a monorepo with two deployable parts:

- **`apps/web`** — a Next.js 15 app. **Vercel-native** (`next build` passes; ~113 kB first load).
- **`apps/api`** — a FastAPI (Python) service. Deployable two ways: as **Vercel Python
  Serverless Functions** (`apps/api/vercel.json` + `apps/api/api/index.py` are wired up), or
  on a **long-lived Python host** (Render/Railway/Fly/VM). Use a long-lived host for *live*
  OpenAI runs — see the serverless caveat in step 2.

## 1. Deploy the web app to Vercel

In the Vercel dashboard → **Add New… → Project → import this repo**, then:

- **Root Directory:** `apps/web` (Vercel auto-detects Next.js; no `vercel.json` needed).
- **Build Command:** `next build` (default) · **Install:** `npm install`.
- **Environment Variable:** `NEXT_PUBLIC_API_BASE_URL = https://<your-api-host>`
  (the public URL of the deployed API from step 2). This is the only public var —
  never put server secrets in `NEXT_PUBLIC_*`.

CLI alternative:

```bash
cd apps/web
npx vercel            # first deploy / link
npx vercel --prod     # production
```

## 2. Host the API

The API holds server-only secrets (`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`TRACERAZOR_BIN`). Pick one of:

**Option A — Vercel Python Functions.** Vercel deploys the FastAPI app as a single function.
`apps/api/api/index.py` re-exports the app (`from assay_api.main import app`) and
`apps/api/pyproject.toml` configures the deploy:

- `[tool.vercel].entrypoint = "api.index:app"` — **required**, because several files export
  `app` (the entrypoint, `assay_api/main.py`, and the test modules), so Vercel's FastAPI
  auto-detection can't pick one and fails the build (~2s, "No FastAPI entrypoint found") without it.
- `[project].dependencies` (kept in sync with `requirements.txt`) — Vercel installs deps with
  `uv` from this, and `[tool.uv] package = false` stops uv trying to build the repo as a package.
- `apps/api/.vercelignore` drops `tests/` + local db files from the bundle.

In Vercel: **Add New… → Project → import this repo**, then in **Settings → Build & Deployment**
set **Root Directory: `apps/api`** — this is **load-bearing**: git-triggered deploys run from the
repo root by default, which (a) can't import `assay_api` from `api/index.py` and (b) won't find
`apps/api/pyproject.toml`. With the root unset, deploys fail; with it set to `apps/api`, they pass.
(A `vercel deploy` from inside `apps/api` works regardless, since the CLI uploads that dir as the root.)

> **Serverless caveat:** `POST /runs/{id}/start` runs the whole exam synchronously, so a
> *live* OpenAI run can exceed Vercel's function time limit. **Demo runs** (no key, or the
> deterministic agent-aware grader) finish fast and are fine on serverless; for **live**
> evaluation host the API on a long-lived process (Option B) until `/start` is made async.
> Vercel's ephemeral filesystem also means SQLite won't persist — **`ASSAY_DB_BACKEND=supabase`
> is required** there.

**Option B — long-lived Python host** (Render, Railway, Fly.io, Azure App Service, a VM):

```bash
python -m uvicorn assay_api.main:app --app-dir apps/api --host 0.0.0.0 --port $PORT
```

Set these env vars on the API host (server-only), for either option:

- `ASSAY_DB_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `ASSAY_ENV=production`
- `ASSAY_API_KEYS=<comma-separated strong shared API keys>`
- `ASSAY_REQUIRE_TENANT=1` for hosted multi-tenant mode; clients must send
  `X-Assay-Tenant` on non-health routes
- `ASSAY_CORS_ORIGINS=https://<your-web-host>` (comma-separated for multiple web origins)
- `ASSAY_RATE_LIMIT_ENABLED=1` (default) plus optional per-route limits such as `ASSAY_RATE_LIMIT_CREATE_RUN`
- `ASSAY_REQUIRE_HARDENING=1` to fail startup instead of only warning when production hardening is incomplete
- `OPENAI_API_KEY` (optional — enables the OpenAI research/extraction layer)
- `ASSAY_LLM_JUDGE_ENABLED=1` (optional) to enable semantic judge assistance
  for paraphrase rescue evidence

Production startup warns when API keys, explicit CORS origins, or rate limiting
are missing; set `ASSAY_REQUIRE_HARDENING=1` on hosted environments to make
that warning fail loud during boot. Keep `ASSAY_HTTP_CANDIDATE_ALLOW_PRIVATE`
unset or `0` in production so user-submitted HTTP candidates cannot target
loopback, RFC1918 networks, link-local addresses, or cloud metadata endpoints.
In tenant-required mode, API handlers also scope candidates, runs, events,
scorecards, lessons, and proof bundles to the active `X-Assay-Tenant`.

Secret hygiene: inject `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` through
the host's secret manager, never through committed files. Rotate local OpenAI
and Supabase service-role keys if the development machine has ever been shared.

## 3. Database

The schema is managed by `supabase/migrations/*.sql` and uses **`assay_*`** tables
(`assay_candidates`, `assay_runs`, `assay_events`, `assay_scorecards`, `assay_lessons`)
with RLS + service-role policies. The `SupabaseStore` auto-detects the table prefix and
transparently falls back to legacy `interviu_*` tables if a project predates the rename;
force one with `ASSAY_SUPABASE_TABLE_PREFIX=assay|interviu`. `assay_lessons` powers the
closed learning loop — without it, runs still complete but lessons don't persist.
Each product's tables can optionally move to their own namespace via per-product
prefixes (`ASSAY_SUPABASE_PREFIX_AGENTS|RUNS|DIAGNOSTICS`); see
[docs/supabase.md](supabase.md#per-product-table-namespaces).

Apply pending migrations with the Supabase CLI (`supabase db push`) or the dashboard SQL
editor. `GET /health` reports the resolved backend and (for Supabase) the detected schema
and per-table availability. SQLite is the local fallback when the Supabase vars are absent.
