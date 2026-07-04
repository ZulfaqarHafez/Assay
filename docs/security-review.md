# Security Review - 2026-07-04

Scope: Assay / Guardrail Prover handover verification for the current deploy
path.

## Summary

Status: pass for code, dependency, browser, and production-build gates. The only
local infrastructure limitation is Docker Desktop's Linux engine, which is not
running in this Windows session.

- Removed stale public surfaces: `/agents`, `/suites`, `/connectors`,
  `/connectors/probe`, standalone suite import/export routes, and standalone
  role-analysis routes now return 404.
- No sandbox execution primitive was found in the simulated tool sandbox or
  sandboxed adapter.
- SSRF protections and tests reject loopback, localhost, link-local metadata,
  private RFC1918, and non-HTTP endpoints.
- Secret scan passed.
- Python and npm dependency audits reported no known vulnerabilities.
- API tests, web unit tests, lint, type-check, production build, and Playwright
  smoke all passed.
- Production web builds no longer fetch remote Google fonts; font variables now
  resolve to local/system fallback stacks.
- Public browser mode in production now requires an explicit
  `ASSAY_PUBLIC_BROWSER_API=1` when no API keys are configured.
- HTTP candidate responses are streamed with a byte cap to reduce memory DoS
  exposure.
- Tenant-bound API keys, stricter tenant schema checks, and trusted-proxy-only
  `X-Forwarded-For` handling were added.

## Evidence

Commands run on 2026-07-04:

```powershell
rg -n "subprocess|os\.system|eval\(|exec\(|Popen|run\(" apps\api\assay_api\sandbox.py apps\api\assay_api\adapters\sandboxed.py
powershell -ExecutionPolicy Bypass -File scripts\check-secrets.ps1
python -m pytest apps/api/tests -q
python -m pytest apps/api/tests/test_security.py apps/api/tests/test_agent_research.py apps/api/tests/test_role_qualification.py apps/api/tests/test_guardrail_e2e.py -q -x
python -m pip_audit -r apps/api/requirements.txt --timeout 60 --progress-spinner off
python -m pip_audit -r apps/api/requirements-dev.txt --timeout 60 --progress-spinner off
npm --workspace apps/web audit --omit=dev
npx eslint apps/web/src
npx tsc --noEmit --pretty false
npm --workspace apps/web run test -- --run --reporter=dot
npm --workspace apps/web run build
npm --workspace apps/web run test:e2e
docker version --format '{{.Server.Version}}'
```

Results:

- Sandbox static search: no matches.
- Secret scan: `No tracked secret patterns found.`
- Full API tests: `214 passed`.
- Focused security/guardrail API tests: `47 passed`.
- `pip-audit` runtime requirements: `No known vulnerabilities found`.
- `pip-audit` dev requirements: `No known vulnerabilities found`.
- npm production audit: `found 0 vulnerabilities`.
- Web lint: passed.
- Web type-check: passed.
- Web unit tests: `77 passed`.
- Production build: passed; route list contains `/`, `/runs`, `/runs/[runId]`,
  `/_not-found`, and `/icon.png` only.
- Playwright smoke with local SQLite/mock API: `7 passed`, `1 skipped`
  intentionally to avoid duplicating the full run on mobile.
- Docker smoke: blocked locally because Docker Desktop's Linux engine pipe is
  unavailable.

## Review Notes

Sandbox execution:

- `apps/api/assay_api/sandbox.py` only merges declared tools and returns
  scripted JSON/string outputs.
- `apps/api/assay_api/adapters/sandboxed.py` sends tool schemas to the model,
  records requested tool calls, and routes every call through
  `ToolSandbox.simulate`.
- No shell execution, subprocess launch, `eval`, or `exec` path is present in
  those sandbox files.

Secrets and client exposure:

- API keys and OpenAI/Supabase server credentials are read from server-side
  environment variables in API code.
- The web build uses only `NEXT_PUBLIC_API_BASE_URL` for browser-visible API
  routing; production browser builds fail fast if it is missing.
- The tracked-file secret scanner remains wired in `.github/workflows/ci.yml`.

SSRF and DoS:

- `network_guard.validate_http_candidate_endpoint` blocks private, loopback,
  link-local, localhost, and non-HTTP(S) candidate URLs unless
  `ASSAY_HTTP_CANDIDATE_ALLOW_PRIVATE=1`.
- HTTP candidate response reads enforce timeouts and
  `ASSAY_HTTP_CANDIDATE_MAX_BYTES`.
- Candidate payload shape tests reject oversized answers, reasoning, tool calls,
  tool parameters, invalid JSON shapes, and invalid token values.
- Sandboxed live model runs enforce max turns and max tool calls.

Auth, tenant, CORS, and rate limits:

- Public paths remain limited to health, badge/card style reads, and explicitly
  public report assets.
- Production hardening now requires explicit public browser mode when API keys
  are absent.
- Tenant-bound API key configuration can scope a key to a tenant.
- Tenant-required mode fails closed if a configured Supabase table is missing
  `tenant_id`.
- `X-Forwarded-For` is ignored unless `ASSAY_TRUST_PROXY_HEADERS=1`.

Assets:

- Verified bitmap assets in `apps/web/public/brand`, `apps/web/public/art`, and
  `docs/images` exist and have readable dimensions.
- The old `/public/sprites` sheet workflow is retired; `Sprite` now maps legacy
  names to Lucide icons.

## Remaining Non-Blocking Item

- Start Docker Desktop's Linux engine to rerun `docker build -t assay-api
  apps/api` and the container `/health` smoke locally. This does not block the
  current Vercel deploy path.
