# Contributing to Assay

Thanks for your interest in improving Assay — the pre-deployment litmus test for
AI agents. This guide covers how to get set up and what we expect in a change.

## Getting started

```powershell
.\scripts\setup.ps1      # installs API + web deps, wires the local TraceRazor checkout
.\scripts\start-dev.ps1  # starts both servers, prints the URLs
```

The two apps are siblings in the monorepo:

- `apps/api` — Python FastAPI backend (package `assay_api`)
- `apps/web` — Next.js 16 / React 19 front end

## Before you open a PR

Run the full suite locally — a PR should be green on all of these:

```powershell
python -m pytest apps/api/tests -q
npm --workspace apps/web run test -- --run
npm --workspace apps/web run build
npx eslint apps/web/src
```

For changes to the run/verdict flow, also run the end-to-end Playwright spec:

```powershell
cd apps/web; npx playwright test src/e2e/assay.spec.ts --workers=1
```

## Expectations

- **Keep local development frictionless.** Localhost auth/CORS/rate-limit behavior
  must stay usable with no extra setup.
- **Never commit secrets.** `.env` / `.env.*` are git-ignored; inject secrets via
  the environment or a secret manager.
- **Don't weaken auth, validation, build checks, lint, or tests** to make a change pass.
- **Match the surrounding code.** New behavior needs tests in the same style as the
  existing ones.
- **One focused change per PR** with a clear description of the problem and the fix.

## Reporting bugs and ideas

Open a GitHub issue with steps to reproduce (for bugs) or the user problem you're
solving (for features). Security issues go through [SECURITY.md](SECURITY.md), not
public issues.
