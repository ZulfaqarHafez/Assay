from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

# Shared type aliases used across the per-domain model modules.
AgentReadiness = Literal["ready", "refine", "needs_subagents"]
SubAgentPriority = Literal["recommended", "optional"]
Seniority = Literal["intern", "junior", "mid", "senior", "lead", "executive", "unspecified"]
# "mock" is read-only legacy: candidates stored by the removed demo grader still
# load, but cannot be created or examined (see model_access).
AdapterType = Literal["openai-compatible", "http", "local-command", "mcp-server", "mock"]
RunStatus = Literal["created", "running", "completed", "failed"]
LessonOutcome = Literal["pending", "improved", "regressed", "unchanged", "still_failing"]

# Shared bounds / patterns. Kept private (leading underscore) to mirror the
# original single-module layout; re-exported from the package __init__.
_MAX_RAW_SCOPE_CHARS = 8000
_MAX_CANDIDATE_ANSWER_CHARS = 20000
_MAX_CANDIDATE_REASONING_CHARS = 20000
_MAX_TOOL_CALLS = 20
_MAX_TOOL_PARAM_BYTES = 8192
_MAX_TOOL_TEXT_CHARS = 8000
_TENANT_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$"
_PUBLIC_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$"
_MAX_PROMPT_CHARS = 4000
_MAX_RUBRIC_CHARS = 2000
_MAX_CHECK_TEXT_CHARS = 240
_MAX_CHECK_TERMS = 30


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
