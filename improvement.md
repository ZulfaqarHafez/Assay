# Assay - Improvement Brief

This is the autonomous improvement plan for the Assay/Assay repo. It has two
tracks:

- EXECUTE: low-risk, verifiable hardening, refactor, cleanup, and test work.
- PROPOSE: larger product changes captured as design notes only.

## Operating Rules

- Keep local development frictionless: localhost auth/CORS/rate-limit behavior
  must remain usable without extra setup.
- Do not commit `.env`, `.env.*`, or secret values.
- Do not weaken auth, validation, build checks, lint checks, or tests.
- Run suites sequentially:
  - API: `python -m pytest apps/api/tests -q`
  - Web unit: `npm --workspace apps/web run test -- --run`
  - Web build: `npm --workspace apps/web run build`
  - Lint: `npx eslint apps/web/src`
  - E2E: `cd apps/web && npx playwright test src/e2e/assay.spec.ts --workers=1`
- Never run `next build` while a `next dev` process is sharing `.next`.

## EXECUTE - Security Hardening

### S1. Block SSRF in HTTP Candidate Adapter

HTTP candidate endpoints are user supplied and fetched server-side. Reject
loopback, private, link-local, reserved, and cloud-metadata targets by default.
Resolve all returned IPs and reject unsafe host resolution unless
`ASSAY_HTTP_CANDIDATE_ALLOW_PRIVATE=1` is explicitly set.

Acceptance:

- Candidate creation rejects `127.0.0.1`, `169.254.169.254`, `10.0.0.5`, and
  non-http(s) schemes.
- A public resolved host still works under patched DNS.
- The adapter sink also rejects unsafe legacy/stored configs.

### S2. Production-Safe Defaults

Keep development open, but make hosted production fail loud or warn loudly when
hardening is incomplete.

Acceptance:

- Startup warning covers missing `ASSAY_API_KEYS`, missing
  `ASSAY_CORS_ORIGINS`, and disabled rate limiting under production signals.
- `ASSAY_REQUIRE_HARDENING=1` turns the warning into a startup failure.
- Rate limiting defaults on with generous limits and can be explicitly disabled.
- `.env.example` and `docs/deploy.md` document production env requirements.

### S3. Bound Candidate Responses and Request Models

Bound untrusted HTTP candidate response fields and tighten request schemas.

Acceptance:

- `CandidateResponse.answer` and `reasoning` have max lengths.
- `tool_calls`, tool params, tool text, token counts, and latency are bounded.
- request models reject unexpected fields where appropriate.
- `RoleAnalysisRequest.override_pack_id` is pattern-limited.

### S4. Secret and Supply-Chain Hygiene

Keep `.env` ignored and add an automated tracked-file secret pattern check.

Acceptance:

- Secret scanner fails on likely OpenAI and Supabase key patterns.
- CI runs the scanner.
- Docs remind maintainers to inject secrets through environment/secret managers.

## EXECUTE - Refactoring and Dead Code

### R1. Delete Dead `derive.ts` Exports

Remove cockpit-era exports with zero live references:

- `buildRoster`
- `buildWorkflow`
- `buildReviewers`
- `rosterSprite`
- `traceRosterMeta`
- `readinessLabel`
- `connectorIcon`
- `candidateDockSprite`
- `readinessSprite`
- `runSprite`
- `refineryHeroClass`

Keep the helpers still listed as retained utility surface, including
`labelize`, `errorMessage`, `maxTransferGap`, `traceScoreLabel`,
`traceStatus`, `traceAuditStatus`, `emptyCompetencies`, `idleSpriteForPack`,
`downloadJson`, and `LoadState`.

### R2. Delete Dead Cockpit CSS

Remove legacy `.app-shell`, `.arena*`, `.workbench`, `.topbar`, `.metric*`,
`.roster-*`, and `.workflow-*` rules after confirming no live TSX references.
Keep `.command-button`, `.panel-section`, run-detail classes, and workspace
classes that current routes still use.

### R3. Loading-State Consistency

Replace the `RunComparison` plain loading text with the shared
`ws-skeleton-row` shimmer skeleton.

### R4. Extract `RunDetail.tsx` Inline Styles

Move run-detail layout styles into `.rd-*` CSS classes with no behavior change.

### R5. Decompose `RunOrchestrator.start()`

Keep behavior the same while extracting the run item loop and scorecard assembly
into helpers.

### R6. Optional Exam-Pack Data Move

Move built-in exam packs out of Python only if it remains green and clearly
reduces complexity. This optional item can be skipped.

## EXECUTE - Tests and CI

Acceptance:

- Add SSRF, hardening, and candidate payload-bound API tests.
- Add focused web component tests for CommandPalette, EmptyArt, and
  RunComparison loading state.
- CI runs secret scan, pytest, eslint, TypeScript, unit tests, build, and
  Playwright e2e.

## PROPOSE - Design Notes Only

Do not build these unattended. Capture design notes under `proposals/`:

- `assay-cli` and GitHub Action
- LLM-judge scoring fallback
- Broader user-uploadable exam packs
- Decision on hidden backend surfaces after cockpit removal
- Auth and multi-tenant scope

## Product Read

Assay is a polished local agent-vetting harness for a narrow, HR-heavy niche.
The strongest near-term direction is to become an adversarial held-out testing
gate with local audit evidence. The biggest product gaps are CI integration,
scoring robustness, exam-pack breadth, and hosted-account boundaries.

## Overall Flow

`/` paste or upload `agent.md` -> register candidate -> stream judging ->
verdict -> open workspace -> `/runs/[id]` with verdict band, radar,
comparison, learning trend, diagnostics, reviewers, and trace drawer.
