"""Deterministic facts detected from a submitted agent definition markdown.

When a user submits an ``agent.md`` / ``AGENTS.md`` (the agent's system
prompt/persona/tools) as the candidate under test, this module extracts a small
set of facts from the raw markdown without any LLM call: the agent's title/role,
the tools it references, and a rough token estimate. These facts are stored on
the candidate's metadata and returned to the caller so the demo path stays fully
deterministic and offline.
"""
from __future__ import annotations

import re
from typing import Any

from .tool_parser import parse_tool_names_from_markdown

_MAX_TOOLS = 12
_FALLBACK_TITLE = "Untitled agent"

# `# Heading` (single leading hash, not `##`).
_H1_RE = re.compile(r"^\s*#\s+(.+?)\s*#*\s*$")
# `role: ...` / `name: ...` (optionally bolded / bulleted).
_FIELD_RE = re.compile(r"^\s*[-*]?\s*\**(role|name)\**\s*:\s*(.+?)\s*$", re.IGNORECASE)

def detect_agent_facts(markdown: str) -> dict[str, Any]:
    """Extract title/role, tools, tool_count, and token_estimate from markdown."""

    text = markdown or ""
    lines = text.splitlines()

    title = _detect_title(lines)
    tools = parse_tool_names_from_markdown(text, limit=_MAX_TOOLS)
    return {
        "title": title,
        "role": title,
        "tools": tools,
        "tool_count": len(tools),
        "token_estimate": len(text) // 4,
    }


def _detect_title(lines: list[str]) -> str:
    for line in lines:
        match = _H1_RE.match(line)
        if match:
            heading = match.group(1).strip()
            if heading:
                return heading
    for line in lines:
        match = _FIELD_RE.match(line)
        if match:
            value = match.group(2).strip().strip("`*").strip()
            if value:
                return value
    return _FALLBACK_TITLE
