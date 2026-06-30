from __future__ import annotations

import os

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .agent_research import load_local_env
from .database import init_db, list_candidates, save_candidate
from .logging_config import (
    REQUEST_ID_HEADER,
    RequestContextMiddleware,
    configure_logging,
    current_request_id,
)
from .models import CandidateConfig
from .rate_limit import RATE_LIMIT_ENABLED_ENV, limiter, rate_limiting_enabled
from .routers import candidates, connectors, health, role, runs, suites
from .security import API_KEYS_ENV, configured_api_keys, require_api_key
from .tenancy import REQUIRE_TENANT_ENV, require_tenant, tenant_required

_DEFAULT_CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]


def _cors_origins() -> list[str]:
    """Resolve the CORS allowlist from ``ASSAY_CORS_ORIGINS`` (comma-separated).

    Defaults to the local dev origins so the web app keeps working when unset.
    """

    raw = os.environ.get("ASSAY_CORS_ORIGINS", "").strip()
    if not raw:
        return list(_DEFAULT_CORS_ORIGINS)
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return origins or list(_DEFAULT_CORS_ORIGINS)


# In dev (no explicit allowlist) the web server auto-scans for a free port, so it
# may land on any localhost port — allow the whole local range via regex. When
# ASSAY_CORS_ORIGINS is set (production), this stays None and the explicit
# allowlist is the only thing honored.
def _cors_origin_regex() -> str | None:
    if os.environ.get("ASSAY_CORS_ORIGINS", "").strip():
        return None
    return r"https?://(localhost|127\.0\.0\.1)(:\d+)?"


logger = configure_logging()


# Auth is applied globally (opt-in via ASSAY_API_KEYS). /health and
# /health/database are exempted in the security dependency so probes never
# require a key.
app = FastAPI(
    title="Assay API",
    version="0.1.0",
    dependencies=[Depends(require_api_key), Depends(require_tenant)],
)

app.state.limiter = limiter

app.add_middleware(RequestContextMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=_cors_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount one router per product surface. Route handlers live in ``routers/``.
app.include_router(health.router)
app.include_router(suites.router)
app.include_router(candidates.router)
app.include_router(runs.router)
app.include_router(role.router)
app.include_router(connectors.router)


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _is_local_host(value: str | None) -> bool:
    host = (value or "").strip().lower()
    return not host or host in {"127.0.0.1", "localhost", "::1"}


def _deployed_signal_present() -> bool:
    env = os.environ.get("ASSAY_ENV", "").strip().lower()
    if env in {"prod", "production", "staging"}:
        return True
    if os.environ.get("PORT") and env not in {"dev", "development", "local", "test"}:
        return True
    if not _is_local_host(os.environ.get("ASSAY_HOST")) and not os.environ.get("ASSAY_CORS_ORIGINS", "").strip():
        return True
    return False


def production_hardening_findings() -> list[str]:
    if not _deployed_signal_present():
        return []
    findings: list[str] = []
    if not configured_api_keys():
        findings.append(f"{API_KEYS_ENV} is unset")
    if tenant_required() and not configured_api_keys():
        findings.append(f"{REQUIRE_TENANT_ENV} requires API keys")
    if not os.environ.get("ASSAY_CORS_ORIGINS", "").strip():
        findings.append("ASSAY_CORS_ORIGINS is unset")
    if not rate_limiting_enabled():
        findings.append(f"{RATE_LIMIT_ENABLED_ENV} disables rate limiting")
    return findings


def _check_production_hardening() -> None:
    findings = production_hardening_findings()
    if not findings:
        return
    message = "Production hardening is incomplete: " + "; ".join(findings)
    if _truthy(os.environ.get("ASSAY_REQUIRE_HARDENING")):
        raise RuntimeError(message)
    logger.warning(message)


@app.exception_handler(Exception)
async def _unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Return a safe envelope for unexpected errors.

    Intentional ``HTTPException`` responses (400/404/409/422/503) are handled by
    FastAPI's built-in handler and never reach here. For anything else we log the
    full traceback server-side and return a generic message plus the request id,
    so internal details / ``str(exc)`` are not leaked to clients.
    """

    request_id = getattr(request.state, "request_id", None) or current_request_id()
    logger.exception(
        "unhandled exception",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
        },
    )
    headers = {REQUEST_ID_HEADER: request_id} if request_id else None
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "request_id": request_id},
        headers=headers,
    )


@app.on_event("startup")
def startup() -> None:
    load_local_env()
    _check_production_hardening()
    init_db()
    candidates = list_candidates()
    if not candidates:
        save_candidate(CandidateConfig(name="Demo Candidate", adapter_type="mock"))
        return
    for candidate in candidates:
        if candidate.adapter_type == "mock" and candidate.name == "Demo HR Agent" and not candidate.metadata:
            save_candidate(candidate.model_copy(update={"name": "Demo Candidate"}))
