# Security Review - 2026-07-04

Scope: Assay / Guardrail Prover handover verification for the current `main` deployment path.

## Summary

Status: pass with one local infrastructure limitation.

- No sandbox execution primitive was found in the simulated tool sandbox or sandboxed adapter.
- SSRF protections reject loopback, localhost, link-local metadata, private RFC1918, and non-HTTP endpoints.
- Tracked secret scan passed.
- API auth, CORS, hardening, rate limiting, request ID, and safe error-envelope tests passed.
- API and web test suites passed after tightening one stale web test fixture type.
- Python and production npm dependency audits reported no known vulnerabilities.
- Docker container smoke could not run locally because Docker Desktop's Linux engine was not running.

## Evidence

Commands run on 2026-07-04:

```powershell
rg -n "subprocess|os\.system|eval\(|exec\(|Popen|run\(" apps\api\assay_api\sandbox.py apps\api\assay_api\adapters\sandboxed.py
powershell -ExecutionPolicy Bypass -File scripts\check-secrets.ps1
python -m pytest apps/api/tests/test_security.py apps/api/tests/test_adapters.py -q
python -m pip_audit -r apps/api/requirements.txt --timeout 60 --progress-spinner off
npm --workspace apps/web audit --omit=dev
python -m pytest apps/api/tests -q
npx eslint apps/web/src
npx --workspace apps/web tsc --noEmit
npm --workspace apps/web run test -- --run
npm --workspace apps/web run build
python -m pytest apps/api/tests/test_cli.py apps/api/tests/test_guardrail_e2e.py -q
npm --workspace apps/web run test:e2e -- --workers=1
docker build -t assay-api:ci apps/api
```

Results:

- Sandbox static search: no matches.
- Secret scan: `No tracked secret patterns found.`
- Focused security/adapter tests: `47 passed`.
- `pip-audit`: `No known vulnerabilities found`.
- npm production audit: `found 0 vulnerabilities`.
- Full API tests: `219 passed`.
- Web lint: passed.
- Web type-check: passed.
- Web unit tests: `87 passed`.
- Production build: passed with `NEXT_PUBLIC_API_BASE_URL=https://assay-api-psi.vercel.app`.
- CLI and guardrail e2e tests: `5 passed`.
- Playwright production-build smoke: `8 passed` after rebuilding the local smoke artifact with `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8010`.
- Docker build/container smoke: blocked locally by Docker engine availability: `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`.

## Review Notes

Sandbox execution:

- `apps/api/assay_api/sandbox.py` only merges declared tools and returns scripted JSON/string outputs.
- `apps/api/assay_api/adapters/sandboxed.py` sends tool schemas to the model, records requested tool calls, and routes every call through `ToolSandbox.simulate`.
- No shell execution, subprocess launch, `eval`, or `exec` path is present in those sandbox files.

SSRF:

- `apps/api/assay_api/network_guard.py` blocks loopback, private RFC1918, link-local metadata (`169.254.0.0/16`), local IPv6, unique local IPv6, link-local IPv6, and non-global resolved IPs by default.
- `ASSAY_HTTP_CANDIDATE_ALLOW_PRIVATE` is the explicit escape hatch for private endpoints.
- Coverage now includes `127.0.0.1`, `localhost`, `169.254.169.254`, `10.0.0.5`, and `file:///etc/passwd`.

Secrets and client exposure:

- API keys and OpenAI/Supabase server credentials are read from server-side environment variables in API code.
- The web build uses only `NEXT_PUBLIC_API_BASE_URL` for browser-visible API routing.
- The tracked-file secret scanner is wired in `.github/workflows/ci.yml` and passed locally.

CORS and public endpoints:

- Health routes and badge SVGs remain public by design.
- Protected run routes reject missing API keys when `ASSAY_API_KEYS` is configured.
- Production hardening tests cover locked CORS with browser-facing public API mode.

Input caps and DoS:

- HTTP candidate responses enforce connect/read timeouts.
- HTTP candidate response size is capped by `ASSAY_HTTP_CANDIDATE_MAX_BYTES`.
- Candidate payload shape tests reject oversized answer/reasoning fields, excessive tool calls, oversized tool parameters, invalid JSON shapes, and invalid token values.
- Sandboxed live model runs enforce max turns and max tool calls.

## Remaining Non-Blocking Items

- Docker Desktop's Linux engine must be started to rerun the container smoke locally.
- The handover's web-cut task is still not complete: the production build still contains `/agents` and `/suites`. That is a product-surface cleanup item, not a newly introduced security regression in this review.
