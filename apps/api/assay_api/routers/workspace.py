from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..cache_headers import public_read_json_headers
from ..database import list_candidate_summaries
from ..exam_packs import list_exam_packs
from .health import health_payload

router = APIRouter()


@router.get("/workspace/boot")
def workspace_boot() -> JSONResponse:
    return JSONResponse(
        content={
            "schema": "assay.workspace_boot.v1",
            "health": health_payload(),
            "exam_packs": [pack.model_dump(mode="json") for pack in list_exam_packs()],
            "candidate_summaries": list_candidate_summaries(),
        },
        headers=public_read_json_headers(),
    )
