from __future__ import annotations

import hmac
import os

from fastapi import Header, HTTPException, Request, status

API_KEY_HEADER = "X-API-Key"
API_KEYS_ENV = "ASSAY_API_KEYS"
TENANT_API_KEYS_ENV = "ASSAY_TENANT_API_KEYS"

# Paths that must always be reachable without a key (health probes / preflight).
EXEMPT_PATHS = {"/health", "/health/database"}


def is_public_path(path: str) -> bool:
    """True for endpoints that must work without an API key.

    Health probes for load balancers, plus the run status badge and verdict card
    — shareable proof artifacts embedded as an ``<img>`` in a README/PR, which
    cannot send an auth header. They only expose a run's ship/risky/hold verdict,
    which is the whole point of a public trust signal.
    """
    return path in EXEMPT_PATHS or path.endswith(("/badge.svg", "/card.svg"))


def configured_api_keys() -> set[str]:
    """Return the set of accepted API keys parsed from ``ASSAY_API_KEYS``.

    The env var is a comma-separated list. Empty/whitespace entries are dropped.
    When unset or empty the returned set is empty, which means auth is disabled
    (open access, matching the prototype's default behaviour).
    """

    raw = os.environ.get(API_KEYS_ENV, "")
    keys = {key.strip() for key in raw.split(",") if key.strip()}
    for tenant_keys in configured_tenant_api_keys().values():
        keys.update(tenant_keys)
    return keys


def configured_tenant_api_keys() -> dict[str, set[str]]:
    """Return tenant-scoped API keys parsed from ``ASSAY_TENANT_API_KEYS``.

    Format: ``tenant_a:key-a,tenant_b=key-b``. Tenant mode uses this mapping to
    bind the caller's API key to the requested ``X-Assay-Tenant`` value.
    """

    raw = os.environ.get(TENANT_API_KEYS_ENV, "")
    mapping: dict[str, set[str]] = {}
    for entry in raw.replace("\n", ",").replace(";", ",").split(","):
        item = entry.strip()
        if not item:
            continue
        separator = ":" if ":" in item else "=" if "=" in item else ""
        if not separator:
            continue
        tenant_id, _, key = item.partition(separator)
        tenant_id = tenant_id.strip()
        key = key.strip()
        if tenant_id and key:
            mapping.setdefault(tenant_id, set()).add(key)
    return mapping


def _key_matches(candidate: str, accepted: set[str]) -> bool:
    # Constant-time comparison against each accepted key to avoid timing leaks.
    return any(hmac.compare_digest(candidate, key) for key in accepted)


def tenant_key_matches(tenant_id: str, candidate: str | None) -> bool:
    if candidate is None:
        return False
    accepted = configured_tenant_api_keys().get(tenant_id, set())
    return _key_matches(candidate, accepted)


async def require_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias=API_KEY_HEADER),
) -> None:
    """Global auth dependency.

    Opt-in: if ``ASSAY_API_KEYS`` is unset/empty this is a no-op so the local
    dev app keeps working with no auth configured. When keys are configured, a
    matching ``X-API-Key`` header is required or the request is rejected with 401.
    Health probes (see ``EXEMPT_PATHS``) are always allowed.
    """

    accepted = configured_api_keys()
    if not accepted:
        return
    if is_public_path(request.url.path):
        return
    if x_api_key is None or not _key_matches(x_api_key, accepted):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid API key",
            headers={"WWW-Authenticate": API_KEY_HEADER},
        )
