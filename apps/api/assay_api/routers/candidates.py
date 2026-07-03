from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..agent_formats import normalize_agent_definition
from ..agent_refinery import agent_spec_payload
from ..cache_headers import public_read_json_headers
from ..agent_intake import detect_agent_facts
from ..agent_research import resolve_openai_key
from ..database import (
    get_candidate,
    list_candidate_summaries,
    list_candidates,
    list_run_summaries,
    list_run_summaries_for_candidate,
    save_candidate,
)
from ..models import CandidateConfig
from ..progress import candidate_progress, lesson_library
from ..tool_parser import parse_tools

router = APIRouter()

_MAX_AGENT_MD_CHARS = 20000
_MAX_TOOLS_CODE_CHARS = 60000


class AgentMarkdownRequest(BaseModel):
    """An agent definition submitted as a candidate.

    ``markdown`` is the legacy field; ``content`` (+ optional ``filename`` /
    ``format``) accepts any supported format — markdown, YAML-frontmatter
    markdown, OpenAI Assistants / generic agent JSON, CrewAI-style YAML, or
    TOML — normalized server-side into canonical markdown. Optionally include
    the agent's tools — either Python source (``tools.py``, parsed by
    signature, never executed) or an OpenAI function-schema JSON — so Assay
    can evaluate tool use, not just prose.
    """

    markdown: str | None = Field(default=None, min_length=1, max_length=_MAX_AGENT_MD_CHARS)
    content: str | None = Field(default=None, min_length=1, max_length=_MAX_AGENT_MD_CHARS)
    filename: str | None = Field(default=None, max_length=255)
    format: Literal["markdown", "json", "yaml", "toml", "text"] | None = None
    name: str | None = None
    tools_code: str | None = Field(default=None, max_length=_MAX_TOOLS_CODE_CHARS)
    tools_format: Literal["python", "json-schema"] = "python"

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _exactly_one_body(self) -> "AgentMarkdownRequest":
        if bool(self.markdown) == bool(self.content):
            raise ValueError("Provide exactly one of 'markdown' or 'content'.")
        return self


@router.get("/candidates")
def candidates() -> list[dict]:
    return [candidate.model_dump(mode="json") for candidate in list_candidates()]


@router.get("/candidates/summary")
def candidate_summaries() -> JSONResponse:
    return JSONResponse(
        content=list_candidate_summaries(),
        headers=public_read_json_headers(),
    )


@router.get("/agents/summary")
def agent_summaries() -> JSONResponse:
    return JSONResponse(
        content=_agent_rollups(list_candidate_summaries(), list_run_summaries()),
        headers=public_read_json_headers(),
    )


@router.get("/agents/{candidate_id}/home")
def agent_home(candidate_id: str, include_agent_markdown: bool = True) -> JSONResponse:
    candidate = get_candidate(candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    runs = list_run_summaries_for_candidate(candidate_id)
    payload = {
        "schema": "assay.agent_home.v1",
        "candidate": {
            "id": candidate.id,
            "name": candidate.name,
            "adapter_type": candidate.adapter_type,
            "created_at": candidate.created_at.isoformat(),
        },
        "runs": _run_rows_for_candidate(runs, candidate),
        # Older clients expect this field; the current web app asks for the fast
        # summary form and fetches /runs/{id}/agent-spec only when the user tests
        # the improved agent.
        "latest_agent_markdown": _latest_agent_markdown(runs) if include_agent_markdown else None,
    }
    return JSONResponse(
        content=payload,
        headers=public_read_json_headers(),
    )


@router.post("/candidates")
def create_candidate(candidate: CandidateConfig) -> dict:
    return save_candidate(candidate).model_dump(mode="json")


@router.post("/candidates/from-markdown")
def create_candidate_from_markdown(request: AgentMarkdownRequest) -> dict:
    """Register an agent definition markdown as a candidate under test.

    The raw ``agent.md`` is stored as the candidate's ``system_prompt``. When an
    OpenAI key is configured the candidate runs live via the OpenAI-compatible
    prompt adapter; otherwise it falls back to the deterministic mock so the demo
    still runs offline. Facts (role, tools, token estimate) are detected from the
    markdown without any network call.
    """

    raw = (request.content or request.markdown or "")[:_MAX_AGENT_MD_CHARS]
    normalized = normalize_agent_definition(raw, filename=request.filename, format=request.format)
    markdown = normalized.markdown[:_MAX_AGENT_MD_CHARS]
    detected = {**detect_agent_facts(markdown), **normalized.facts_overrides}

    # Parse the agent's real tools (signatures only — never executed) so the exam
    # can evaluate tool use. Falls back to the markdown-scraped tool names.
    tools = parse_tools(request.tools_code, request.tools_format) if request.tools_code else []

    live = bool(resolve_openai_key())
    mode = "live" if live else "demo"
    adapter_type = "openai-compatible" if live else "mock"

    metadata: dict = {"source": "agent-md", "source_format": normalized.format, **detected}
    if normalized.source_content != markdown:
        metadata["source_content"] = normalized.source_content

    candidate = CandidateConfig(
        name=request.name or detected["title"],
        adapter_type=adapter_type,
        system_prompt=markdown,
        tools=tools,
        metadata=metadata,
    )
    saved = save_candidate(candidate)

    return {
        "candidate": saved.model_dump(mode="json"),
        "mode": mode,
        "format": normalized.format,
        "detected": {
            "role": detected["role"],
            "title": detected["title"],
            "tools": [tool.name for tool in tools] or detected["tools"],
            "tool_count": len(tools) or detected["tool_count"],
            "token_estimate": detected["token_estimate"],
            "tool_specs": [
                {"name": t.name, "signature": t.signature, "dangerous": t.dangerous}
                for t in tools
            ],
        },
    }


@router.get("/candidates/{candidate_id}/progress")
def candidate_progress_endpoint(candidate_id: str) -> JSONResponse:
    payload = candidate_progress(candidate_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return JSONResponse(
        content=payload.model_dump(mode="json"),
        headers=public_read_json_headers(),
    )


@router.get("/candidates/{candidate_id}/lessons")
def candidate_lessons(candidate_id: str, exam_pack_id: str | None = None) -> JSONResponse:
    if get_candidate(candidate_id) is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return JSONResponse(
        content=[lesson.model_dump(mode="json") for lesson in lesson_library(candidate_id, exam_pack_id)],
        headers=public_read_json_headers(),
    )


def _agent_rollups(candidates: list[dict], runs: list[dict]) -> list[dict[str, object]]:
    id_to_name = {str(candidate["id"]): str(candidate["name"]) for candidate in candidates}
    id_to_adapter = {str(candidate["id"]): str(candidate["adapter_type"]) for candidate in candidates}
    rows: dict[str, dict[str, object]] = {}

    # Seed from candidates so agents with zero runs still appear.
    for candidate in candidates:
        candidate_id = str(candidate.get("id") or "")
        if not candidate_id:
            continue
        name = str(candidate["name"])
        rows.setdefault(
            candidate_id,
            {
                "name": name,
                "candidate_id": candidate_id,
                "adapter_type": candidate.get("adapter_type", "unknown"),
                "run_count": 0,
                "latest_run_id": None,
                "verdict": None,
                "score": None,
            },
        )

    # Runs come newest-first; the first run per name is its latest verdict.
    for run in runs:
        candidate_id = str(run.get("candidate_id", ""))
        name = id_to_name.get(candidate_id)
        if not name:
            continue
        row = rows.setdefault(
            candidate_id,
            {
                "name": name,
                "candidate_id": candidate_id,
                "adapter_type": id_to_adapter.get(candidate_id, "unknown"),
                "run_count": 0,
                "latest_run_id": None,
                "verdict": None,
                "score": None,
            },
        )
        row["run_count"] = int(row["run_count"]) + 1
        if row["latest_run_id"] is None:
            row["latest_run_id"] = run.get("id")
            if run.get("status") == "completed" and isinstance(run.get("certified"), bool):
                row["verdict"] = "ship" if run["certified"] else "hold"
                if isinstance(run.get("pass_count"), int) and isinstance(run.get("total_count"), int):
                    row["score"] = f"{run['pass_count']}/{run['total_count']}"

    return sorted(
        rows.values(),
        key=lambda row: (-int(row["run_count"]), str(row["name"]).lower(), str(row["candidate_id"])),
    )


def _run_rows_for_candidate(runs: list[dict], candidate: CandidateConfig) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for run in runs:
        row: dict[str, object] = dict(run)
        row["candidate_name"] = candidate.name
        row["candidate_adapter_type"] = candidate.adapter_type
        rows.append(row)
    return rows


def _latest_agent_markdown(runs: list[dict]) -> str | None:
    for run in runs:
        if run.get("status") != "completed":
            continue
        run_id = run.get("id")
        if not isinstance(run_id, str):
            continue
        try:
            spec = agent_spec_payload(run_id)
        except KeyError:
            return None
        if spec and isinstance(spec.get("agent_markdown"), str):
            return spec["agent_markdown"]
    return None
