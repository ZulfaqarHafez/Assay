from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..agent_research import resolve_openai_key
from ..database import database_backend_name, database_health
from ..trace_audit import _load_tracerazor_client

router = APIRouter()


@router.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "service": "assay-api",
        "database_backend": database_backend_name(),
        "tracerazor_importable": _load_tracerazor_client() is not None,
        "openai_configured": bool(resolve_openai_key()),
    }


@router.get("/health/database")
def health_database() -> dict[str, object]:
    try:
        return database_health()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
