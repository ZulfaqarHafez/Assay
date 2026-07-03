from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..cache_headers import public_read_json_headers
from ..database import list_candidate_summaries
from ..exam_packs import list_exam_packs
from ..models import ExamPack
from .health import health_payload

router = APIRouter()


@router.get("/workspace/boot")
def workspace_boot(profile: Literal["full", "summary"] = "full") -> JSONResponse:
    packs = list_exam_packs()
    content: dict[str, object] = {
        "schema": "assay.workspace_boot.v1",
        "health": health_payload(),
        "candidate_summaries": list_candidate_summaries(),
    }
    if profile == "summary":
        content["exam_pack_summaries"] = [_exam_pack_summary(pack) for pack in packs]
    else:
        content["exam_packs"] = [pack.model_dump(mode="json") for pack in packs]
    return JSONResponse(
        content=content,
        headers=public_read_json_headers(),
    )


def _exam_pack_summary(pack: ExamPack) -> dict[str, object]:
    return {
        "id": pack.id,
        "name": pack.name,
        "simulator_model": pack.simulator_model,
        "item_count": len(pack.items),
        "competencies": sorted({item.competency for item in pack.items}),
    }
