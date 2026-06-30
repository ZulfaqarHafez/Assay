from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ..agent_intake import detect_agent_facts
from ..agent_research import resolve_openai_key
from ..database import get_candidate, list_candidates, save_candidate
from ..models import CandidateConfig
from ..progress import candidate_progress, lesson_library
from ..tool_parser import parse_tools

router = APIRouter()

_MAX_AGENT_MD_CHARS = 20000
_MAX_TOOLS_CODE_CHARS = 60000


class AgentMarkdownRequest(BaseModel):
    """An agent definition (``agent.md`` / ``AGENTS.md``) submitted as a candidate.

    Optionally include the agent's tools — either Python source (``tools.py``,
    parsed by signature, never executed) or an OpenAI function-schema JSON — so
    Assay can evaluate tool use, not just prose.
    """

    markdown: str = Field(min_length=1, max_length=_MAX_AGENT_MD_CHARS)
    name: str | None = None
    tools_code: str | None = Field(default=None, max_length=_MAX_TOOLS_CODE_CHARS)
    tools_format: Literal["python", "json-schema"] = "python"

    model_config = ConfigDict(extra="forbid")


@router.get("/candidates")
def candidates() -> list[dict]:
    return [candidate.model_dump(mode="json") for candidate in list_candidates()]


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

    markdown = request.markdown[:_MAX_AGENT_MD_CHARS]
    detected = detect_agent_facts(markdown)

    # Parse the agent's real tools (signatures only — never executed) so the exam
    # can evaluate tool use. Falls back to the markdown-scraped tool names.
    tools = parse_tools(request.tools_code, request.tools_format) if request.tools_code else []

    live = bool(resolve_openai_key())
    mode = "live" if live else "demo"
    adapter_type = "openai-compatible" if live else "mock"

    candidate = CandidateConfig(
        name=request.name or detected["title"],
        adapter_type=adapter_type,
        system_prompt=markdown,
        tools=tools,
        metadata={"source": "agent-md", **detected},
    )
    saved = save_candidate(candidate)

    return {
        "candidate": saved.model_dump(mode="json"),
        "mode": mode,
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
def candidate_progress_endpoint(candidate_id: str) -> dict:
    payload = candidate_progress(candidate_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return payload.model_dump(mode="json")


@router.get("/candidates/{candidate_id}/lessons")
def candidate_lessons(candidate_id: str, exam_pack_id: str | None = None) -> list[dict]:
    if get_candidate(candidate_id) is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return [lesson.model_dump(mode="json") for lesson in lesson_library(candidate_id, exam_pack_id)]
