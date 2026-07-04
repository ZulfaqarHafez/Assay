# Backend Surfaces

Assay now exposes a deliberately small product surface. Older workspace pages
(`/agents`, `/suites`) and their standalone API routes were removed; they should
return 404 in production.

## Product UI Paths

| Capability | API | UI path | Status |
| --- | --- | --- | --- |
| Agent markdown intake | `POST /candidates/from-markdown` | `/` | Primary flow |
| Runs and history | `GET /runs`, `GET /runs/summary` | `/runs` | Visible |
| Read-only run report | `GET /runs/{id}/verdict`, `/surfaces`, `/trace`, `/detail`, `/proof-bundle` | `/runs/{id}` | Visible |
| Badge and proof card | `GET /runs/{id}/badge.svg`, `GET /runs/{id}/card.svg` | Report links / external embeds | Public read |
| Agent spec and fixes | `GET /runs/{id}/agent-spec`, `/agent-spec/diff`, `/payoff` | Verdict/report panels | Visible |

## Advanced Local Integration

HTTP candidates remain supported through `POST /candidates` with
`adapter_type=http`. This is an advanced/local integration: endpoint URLs are
validated by the SSRF guard, and private/loopback targets are blocked unless
`ASSAY_HTTP_CANDIDATE_ALLOW_PRIVATE=1` is explicitly set for a trusted local
harness.

## Internal Or Server-Only

OpenAI research, role extraction, Supabase persistence, and TraceRazor audit
execution are server-only capabilities. Role analysis is performed during run
creation and embedded into proof artifacts when available; there is no supported
standalone `/role-analysis` browser/API surface.

Hosted multi-tenant mode is opt-in with `ASSAY_REQUIRE_TENANT=1`. In that mode
non-health routes require both `X-API-Key` and `X-Assay-Tenant`; stored
candidates, runs, events, scorecards, lessons, and proof bundles are scoped by
tenant id.
