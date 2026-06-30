from __future__ import annotations

from fastapi import APIRouter

from ..connectors import connector_probes, connector_registry

router = APIRouter()


@router.get("/connectors")
def connectors() -> list[dict]:
    return connector_registry()


@router.get("/connectors/probe")
def connectors_probe() -> list[dict]:
    return connector_probes()
