from __future__ import annotations

import os
from typing import Any, Callable

from fastapi import HTTPException, Request, status

# Rate limiting is on by default with generous limits. Set
# ASSAY_RATE_LIMIT_ENABLED=0/false/off to disable it for local troubleshooting.
RATE_LIMIT_ENABLED_ENV = "ASSAY_RATE_LIMIT_ENABLED"

# Per-endpoint limits, each tunable via env. Defaults are generous so normal
# interactive use is never throttled; they exist to blunt abuse/runaway clients.
_LIMIT_ENVS: dict[str, tuple[str, str]] = {
    "create_run": ("ASSAY_RATE_LIMIT_CREATE_RUN", "600/minute"),
    "start_run": ("ASSAY_RATE_LIMIT_START_RUN", "300/minute"),
    "role_analysis": ("ASSAY_RATE_LIMIT_ROLE_ANALYSIS", "300/minute"),
    "agent_research": ("ASSAY_RATE_LIMIT_AGENT_RESEARCH", "120/minute"),
}


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _falsy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"0", "false", "no", "off"}


def rate_limiting_enabled() -> bool:
    raw = os.environ.get(RATE_LIMIT_ENABLED_ENV)
    if raw is None or not raw.strip():
        return True
    if _falsy(raw):
        return False
    return _truthy(raw)


def limit_for(name: str) -> str:
    env_name, default = _LIMIT_ENVS[name]
    return os.environ.get(env_name, "").strip() or default


class _LazyLimiter:
    """Compatibility shim for code that expects ``app.state.limiter``.

    Assay enforces limits through the FastAPI dependency below, so boot/health
    requests should not import SlowAPI's full backend registry on cold start.
    """

    _instance: Any | None = None

    def _get(self) -> Any:
        if self._instance is None:
            from slowapi import Limiter

            self._instance = Limiter(
                key_func=_client_identifier,
                enabled=rate_limiting_enabled(),
                default_limits=[],
            )
        return self._instance

    def __getattr__(self, name: str) -> Any:
        return getattr(self._get(), name)


limiter = _LazyLimiter()
_storage: Any | None = None
_strategy: Any | None = None
_parsed_cache: dict[str, Any] = {}


def _client_identifier(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
    if forwarded:
        return forwarded
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _rate_limiter() -> Any:
    global _storage, _strategy
    if _storage is None:
        from limits.storage import MemoryStorage

        _storage = MemoryStorage()
    if _strategy is None:
        from limits.strategies import MovingWindowRateLimiter

        _strategy = MovingWindowRateLimiter(_storage)
    return _strategy


def _parsed_limit(name: str) -> Any:
    from limits import parse

    spec = limit_for(name)
    item = _parsed_cache.get(spec)
    if item is None:
        item = parse(spec)
        _parsed_cache[spec] = item
    return item


def reset_rate_limit_state() -> None:
    if _storage is not None:
        _storage.reset()
    _parsed_cache.clear()


def rate_limit(name: str) -> Callable[[Request], None]:
    """Build a FastAPI dependency enforcing the named limit per client address."""

    def dependency(request: Request) -> None:
        if not rate_limiting_enabled():
            return
        item = _parsed_limit(name)
        identifier = _client_identifier(request)
        if not _rate_limiter().hit(item, name, identifier):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded",
                headers={"Retry-After": str(item.get_expiry())},
            )

    return dependency
