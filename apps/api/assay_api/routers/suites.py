from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ..exam_packs import (
    exam_pack_export,
    list_exam_packs,
    parse_exam_pack_content,
    register_exam_pack,
)
from ..exports import write_exam_pack_files
from ..models import ExamPack

router = APIRouter()


class ExamPackImportFileRequest(BaseModel):
    content: str = Field(min_length=1, max_length=300_000)
    format: Literal["json", "yaml", "yml"] = "json"

    model_config = ConfigDict(extra="forbid")


@router.get("/exam-packs")
def exam_packs() -> list[dict]:
    return [pack.model_dump(mode="json") for pack in list_exam_packs()]


@router.post("/exam-packs/import")
def import_exam_pack(pack: ExamPack) -> dict:
    try:
        registered = register_exam_pack(pack)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return registered.model_dump(mode="json")


@router.post("/exam-packs/import-file")
def import_exam_pack_file(request: ExamPackImportFileRequest) -> dict:
    try:
        pack = parse_exam_pack_content(request.content, request.format)
        registered = register_exam_pack(pack)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return registered.model_dump(mode="json")


@router.get("/exam-packs/{pack_id}/export")
def export_exam_pack(pack_id: str) -> dict:
    try:
        return exam_pack_export(pack_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Exam pack not found") from exc


@router.post("/exam-packs/{pack_id}/export-files")
def export_exam_pack_files(pack_id: str) -> dict:
    try:
        return write_exam_pack_files(pack_id).model_dump(mode="json")
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Exam pack not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
