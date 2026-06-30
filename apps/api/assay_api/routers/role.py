from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ..exam_packs import get_exam_pack
from ..models import JobScope
from ..rate_limit import rate_limit
from ..role_intelligence import extract_job_scope_openai, role_analysis_payload

router = APIRouter()

_MAX_ROLE_SCOPE_CHARS = 8000


class RoleAnalysisRequest(BaseModel):
    raw_text: str = Field(default="", max_length=_MAX_ROLE_SCOPE_CHARS)
    extract: Literal["keyword", "openai-fast", "openai-deep"] = "keyword"
    override_pack_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,80}$")

    model_config = ConfigDict(extra="forbid")


@router.post("/role-analysis", dependencies=[Depends(rate_limit("role_analysis"))])
def role_analysis(request: RoleAnalysisRequest) -> dict:
    raw_text = (request.raw_text or "")[:_MAX_ROLE_SCOPE_CHARS]
    if request.override_pack_id is not None:
        try:
            get_exam_pack(request.override_pack_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Exam pack not found") from exc

    job_scope: JobScope | None = None
    if request.extract != "keyword":
        mode = "deep" if request.extract == "openai-deep" else "fast"
        try:
            job_scope = extract_job_scope_openai(raw_text, mode=mode)
        except Exception:
            # OpenAI extraction is best-effort recall; fall back to keyword.
            job_scope = None
    if job_scope is None:
        job_scope = JobScope(raw_text=raw_text)

    return role_analysis_payload(job_scope, override_pack_id=request.override_pack_id)
