"""Normalize agent definitions from multiple formats into canonical markdown.

Assay's intake, adapters, and facts detector all speak markdown. This module
lets users bring what they already have — OpenAI Assistants JSON, a generic
``agent.json``, CrewAI-style YAML, TOML, or markdown with YAML frontmatter —
by converting each into the exact markdown shapes ``agent_intake``'s regexes
already parse (H1 title, prose body, a ``## Tools`` bullet list). Detection is
declared format first, then file extension, then content sniffing.
"""
from __future__ import annotations

import json
import tomllib
from typing import Any, Literal

from pydantic import BaseModel, Field

AgentFormat = Literal["markdown", "frontmatter-markdown", "json", "yaml", "toml", "text"]

_EXTENSION_FORMATS: dict[str, AgentFormat] = {
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".md": "markdown",
    ".markdown": "markdown",
    ".txt": "text",
}

_TITLE_KEYS = ("name", "title", "role", "agent_name")
_BODY_KEYS = ("system_prompt", "instructions", "prompt", "description", "goal", "backstory", "persona")


class NormalizedAgent(BaseModel):
    format: AgentFormat
    markdown: str
    source_content: str
    facts_overrides: dict[str, Any] = Field(default_factory=dict)


def detect_format(content: str, filename: str | None = None, declared: str | None = None) -> AgentFormat:
    if declared:
        lowered = declared.strip().lower()
        if lowered in ("markdown", "frontmatter-markdown", "json", "yaml", "toml", "text"):
            return lowered  # type: ignore[return-value]
    if filename:
        dot = filename.rfind(".")
        if dot != -1:
            by_extension = _EXTENSION_FORMATS.get(filename[dot:].lower())
            if by_extension:
                if by_extension == "markdown" and _has_frontmatter(content):
                    return "frontmatter-markdown"
                return by_extension
    return _sniff_format(content)


def normalize_agent_definition(
    content: str, filename: str | None = None, format: str | None = None
) -> NormalizedAgent:
    """Convert any supported agent definition into canonical markdown."""

    detected = detect_format(content, filename, format)
    if detected == "json":
        data = _load_json(content)
        if isinstance(data, dict):
            return _from_structured(content, data, "json")
        detected = "text"
    if detected == "yaml":
        data = _load_yaml(content)
        if isinstance(data, dict):
            return _from_structured(content, data, "yaml")
        detected = "text"
    if detected == "toml":
        data = _load_toml(content)
        if isinstance(data, dict) and data:
            return _from_structured(content, data, "toml")
        detected = "text"
    if detected == "frontmatter-markdown":
        return _from_frontmatter(content)
    return NormalizedAgent(format=detected, markdown=content, source_content=content)


# --- structured configs ------------------------------------------------------


def _from_structured(source: str, data: dict[str, Any], fmt: AgentFormat) -> NormalizedAgent:
    agent = _select_agent_mapping(data)
    title = _first_string(agent, _TITLE_KEYS) or "Untitled agent"
    body_parts = _body_parts(agent)
    tools = _extract_tools(agent.get("tools"))

    markdown = _render_markdown(title, body_parts, tools)
    overrides: dict[str, Any] = {"title": title, "role": title}
    if tools:
        overrides["tools"] = tools
        overrides["tool_count"] = len(tools)
    return NormalizedAgent(
        format=fmt, markdown=markdown, source_content=source, facts_overrides=overrides
    )


def _select_agent_mapping(data: dict[str, Any]) -> dict[str, Any]:
    """Find the mapping that actually describes the agent.

    Handles CrewAI-style ``agents:`` maps (named agents nested one level down)
    and single-key wrappers like ``{"agent": {...}}``; otherwise the top level
    is the agent.
    """
    for wrapper_key in ("agent", "assistant"):
        nested = data.get(wrapper_key)
        if isinstance(nested, dict) and _looks_like_agent(nested):
            return _merge_wrapper_name(wrapper_key, data, nested)
    agents = data.get("agents")
    if isinstance(agents, dict) and agents:
        name, first = next(iter(agents.items()))
        if isinstance(first, dict):
            merged = dict(first)
            # The map key is usually a slug (e.g. "triage"); only fall back to
            # it when the agent has no human-readable name/title/role of its own.
            if not any(key in merged for key in _TITLE_KEYS):
                merged["name"] = str(name)
            return merged
    if isinstance(agents, list) and agents and isinstance(agents[0], dict):
        return agents[0]
    return data


def _merge_wrapper_name(key: str, outer: dict[str, Any], inner: dict[str, Any]) -> dict[str, Any]:
    merged = dict(inner)
    outer_name = _first_string(outer, _TITLE_KEYS)
    if outer_name:
        merged.setdefault("name", outer_name)
    return merged


def _looks_like_agent(mapping: dict[str, Any]) -> bool:
    return any(key in mapping for key in (*_TITLE_KEYS, *_BODY_KEYS, "tools"))


def _first_string(mapping: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = mapping.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _body_parts(agent: dict[str, Any]) -> list[str]:
    parts: list[str] = []
    for key in _BODY_KEYS:
        value = agent.get(key)
        if isinstance(value, str) and value.strip():
            part = value.strip()
            if part not in parts:
                parts.append(part)
    return parts


def _extract_tools(raw: Any) -> list[str]:
    tools: list[str] = []
    seen: set[str] = set()

    def add(name: Any) -> None:
        if not isinstance(name, str):
            return
        cleaned = name.strip()
        if not cleaned or cleaned.lower() in seen:
            return
        seen.add(cleaned.lower())
        tools.append(cleaned)

    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, str):
                add(item)
            elif isinstance(item, dict):
                # OpenAI Assistants: {"type": "function", "function": {"name": ...}}
                function = item.get("function")
                if isinstance(function, dict):
                    add(function.get("name") or item.get("type"))
                else:
                    add(item.get("name") or item.get("type"))
    elif isinstance(raw, dict):
        for key in raw:
            add(key)
    return tools[:12]


def _render_markdown(title: str, body_parts: list[str], tools: list[str]) -> str:
    lines: list[str] = [f"# {title}", ""]
    for part in body_parts:
        lines.append(part)
        lines.append("")
    if tools:
        lines.append("## Tools")
        lines.append("")
        lines.extend(f"- `{tool}`" for tool in tools)
        lines.append("")
    return "\n".join(lines).strip() + "\n"


# --- frontmatter markdown ----------------------------------------------------


def _from_frontmatter(content: str) -> NormalizedAgent:
    meta, body = _split_frontmatter(content)
    if not isinstance(meta, dict):
        return NormalizedAgent(format="markdown", markdown=content, source_content=content)

    title = _first_string(meta, _TITLE_KEYS)
    tools = _extract_tools(meta.get("tools"))
    markdown = body.strip()
    if title and not _has_h1(markdown):
        markdown = f"# {title}\n\n{markdown}"
    if tools and "## tools" not in markdown.lower():
        markdown += "\n\n## Tools\n\n" + "\n".join(f"- `{tool}`" for tool in tools)
    markdown = markdown.strip() + "\n"

    overrides: dict[str, Any] = {}
    if title:
        overrides["title"] = title
        overrides["role"] = title
    if tools:
        overrides["tools"] = tools
        overrides["tool_count"] = len(tools)
    return NormalizedAgent(
        format="frontmatter-markdown",
        markdown=markdown,
        source_content=content,
        facts_overrides=overrides,
    )


def _split_frontmatter(content: str) -> tuple[Any, str]:
    lines = content.splitlines()
    if not lines or lines[0].strip() != "---":
        return None, content
    for index in range(1, len(lines)):
        if lines[index].strip() in ("---", "..."):
            meta = _load_yaml("\n".join(lines[1:index]))
            body = "\n".join(lines[index + 1 :])
            return meta, body
    return None, content


def _has_h1(markdown: str) -> bool:
    return any(line.lstrip().startswith("# ") for line in markdown.splitlines())


def _has_frontmatter(content: str) -> bool:
    meta, _ = _split_frontmatter(content)
    return isinstance(meta, dict) and bool(meta)


# --- sniffing / loading ------------------------------------------------------


def _sniff_format(content: str) -> AgentFormat:
    stripped = content.strip()
    if not stripped:
        return "markdown"
    if _has_frontmatter(content):
        return "frontmatter-markdown"
    if stripped.startswith(("{", "[")) and _load_json(stripped) is not None:
        return "json"
    if "=" in stripped:
        data = _load_toml(content)
        if isinstance(data, dict) and data and _looks_like_agent(_select_agent_mapping(data)):
            return "toml"
    data = _load_yaml(content)
    if isinstance(data, dict) and _looks_like_agent(_select_agent_mapping(data)):
        return "yaml"
    return "markdown"


def _load_json(content: str) -> Any:
    try:
        return json.loads(content)
    except (ValueError, TypeError):
        return None


def _load_yaml(content: str) -> Any:
    import yaml

    try:
        return yaml.safe_load(content)
    except yaml.YAMLError:
        return None


def _load_toml(content: str) -> Any:
    try:
        return tomllib.loads(content)
    except (tomllib.TOMLDecodeError, TypeError):
        return None
