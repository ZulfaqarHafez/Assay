from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter, HTTPException

from ..agent_research import resolve_openai_key
from ..database import database_backend_name, database_health
from ..trace_audit import _load_tracerazor_client

router = APIRouter()


def health_payload() -> dict[str, object]:
    return {
        "ok": True,
        "service": "assay-api",
        "database_backend": database_backend_name(),
        "tracerazor_importable": _tracerazor_importable(),
        "openai_configured": _openai_configured(),
    }


@lru_cache(maxsize=1)
def _tracerazor_importable() -> bool:
    return _load_tracerazor_client() is not None


@lru_cache(maxsize=1)
def _openai_configured() -> bool:
    return bool(resolve_openai_key())


def reset_health_cache() -> None:
    _tracerazor_importable.cache_clear()
    _openai_configured.cache_clear()


@router.get("/health")
def health() -> dict[str, object]:
    return health_payload()


@router.get("/health/database")
def health_database() -> dict[str, object]:
    try:
        return database_health()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
