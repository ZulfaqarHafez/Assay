# Security Policy

Assay is a security-adjacent tool — it stress-tests AI agents for the failure modes
that get them pulled from production — so we take the security of Assay itself
seriously.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, report privately via GitHub's [Security Advisories](https://github.com/ZulfaqarHafez/Assay/security/advisories/new)
("Report a vulnerability"). If that is unavailable, email the maintainer at the
address on the GitHub profile.

Include, where you can:

- the affected component (API, web, CLI, or the TraceRazor integration),
- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- any suggested remediation.

## What to expect

- We aim to acknowledge a report within a few days.
- We'll confirm the issue, keep you updated on remediation, and credit you in the
  release notes unless you prefer to remain anonymous.

## Scope notes

- Assay runs offline by default; the optional OpenAI layer reads its key server-side
  only from a git-ignored `.env`. Never place secrets in any `NEXT_PUBLIC_*` variable.
- HTTP candidate endpoints are user-supplied and fetched server-side; SSRF protections
  reject loopback, private, link-local, reserved, and cloud-metadata targets by default.
  Reports of bypasses are in scope.
