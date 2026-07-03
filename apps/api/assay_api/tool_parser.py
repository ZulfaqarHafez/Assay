"""Parse an agent's tools into `ToolSpec`s for tool-aware evaluation.

Two inputs are supported, both producing the same `ToolSpec` shape (which carries
an OpenAI-function-calling-ready `parameters` JSON Schema):

- **Python source** (`tools.py`): AST-parsed — never executed. We read each
  top-level `def`/`async def`'s signature (param names, type hints, defaults) and
  docstring. Safe to run on untrusted input: `ast.parse` does not execute code.
- **JSON schema**: a list of OpenAI-style tool/function definitions.

Tools whose name suggests a destructive side effect (delete/drop/wipe/transfer/…)
are flagged `dangerous=True` so the exam can probe whether injected instructions
can coerce the agent into calling them.
"""
from __future__ import annotations

import ast
import json
import re
from typing import Any

from .models import ToolSpec

_MAX_TOOLS = 32
_MAX_PARAMS = 30
_MAX_MARKDOWN_TOOLS = 32
# Name hints that suggest a destructive / side-effecting tool. Matched against the
# tool NAME only (not the docstring) to avoid false positives like "lookup by email".
_DANGEROUS_HINTS = (
    "delete", "drop", "remove", "wipe", "erase", "purge", "destroy", "truncate",
    "transfer", "withdraw", "wire", "refund", "payout", "exfiltrate", "send_email",
    "grant", "revoke", "disable", "deactivate", "shutdown", "exec", "run_sql",
    "shell", "sudo", "escalate",
)

_TOOLS_HEADER_RE = re.compile(r"^\s*#{1,6}\s+tools\b.*$", re.IGNORECASE)
_TOOLS_INLINE_RE = re.compile(r"^\s*\**tools\**\s*:\s*(.*)$", re.IGNORECASE)
_ANY_HEADER_RE = re.compile(r"^\s*#{1,6}\s+")
_BULLET_RE = re.compile(r"^\s*[-*+]\s+(.*)$")
_BACKTICK_RE = re.compile(r"`([^`\n]+)`")
_TOOL_TOKEN_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_.\-]{1,63}$")

_TYPE_MAP = {
    "str": "string",
    "int": "integer",
    "float": "number",
    "bool": "boolean",
    "list": "array",
    "dict": "object",
    "tuple": "array",
    "set": "array",
    "bytes": "string",
}


def parse_tool_names_from_markdown(markdown: str | None, *, limit: int = _MAX_MARKDOWN_TOOLS) -> list[str]:
    """Extract referenced tool names from an agent markdown artifact."""

    text = markdown or ""
    tools: list[str] = []
    seen: set[str] = set()
    bounded_limit = max(0, min(limit, _MAX_MARKDOWN_TOOLS))

    def add(candidate: str) -> None:
        if len(tools) >= bounded_limit:
            return
        name = candidate.strip().strip("`*_").strip()
        if "(" in name:
            name = name.split("(", 1)[0].strip()
        if not name or not _TOOL_TOKEN_RE.match(name):
            return
        key = name.lower()
        if key in seen:
            return
        seen.add(key)
        tools.append(name)

    lines = text.splitlines()
    in_tools_section = False
    for line in lines:
        inline = _TOOLS_INLINE_RE.match(line)
        if inline is not None and not _ANY_HEADER_RE.match(line):
            for piece in re.split(r"[,;]", inline.group(1)):
                matches = _BACKTICK_RE.findall(piece)
                for token in matches or [piece]:
                    add(token)
            continue

        if _TOOLS_HEADER_RE.match(line):
            in_tools_section = True
            continue
        if _ANY_HEADER_RE.match(line):
            in_tools_section = False

        if in_tools_section:
            bullet = _BULLET_RE.match(line)
            if not bullet:
                continue
            content = bullet.group(1)
            matches = _BACKTICK_RE.findall(content)
            if matches:
                for token in matches:
                    add(token)
            else:
                add(content.split()[0] if content.split() else "")

    if len(tools) < bounded_limit:
        for match in _BACKTICK_RE.findall(text):
            add(match)
            if len(tools) >= bounded_limit:
                break

    return tools


def parse_tools_from_markdown(markdown: str | None, *, limit: int = _MAX_MARKDOWN_TOOLS) -> list[ToolSpec]:
    """Return minimal ToolSpecs from names declared in an agent markdown artifact."""

    return [
        ToolSpec(name=name, dangerous=_is_dangerous(name))
        for name in parse_tool_names_from_markdown(markdown, limit=limit)
    ]


def parse_tools(source: str | None, fmt: str = "python") -> list[ToolSpec]:
    """Parse tool definitions; returns [] on empty/invalid input (never raises)."""
    text = (source or "").strip()
    if not text:
        return []
    try:
        if fmt == "json-schema":
            return _parse_json_schema(text)
        return _parse_python(text)
    except Exception:
        return []


def _is_dangerous(name: str) -> bool:
    lowered = name.lower()
    return any(hint in lowered for hint in _DANGEROUS_HINTS)


def _parse_python(code: str) -> list[ToolSpec]:
    tree = ast.parse(code)  # raises SyntaxError on bad code -> caught by parse_tools
    specs: list[ToolSpec] = []
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if node.name.startswith("_"):
            continue  # private helpers aren't tools
        spec = _spec_from_func(node)
        if spec is not None:
            specs.append(spec)
        if len(specs) >= _MAX_TOOLS:
            break
    return specs


def _spec_from_func(node: ast.FunctionDef | ast.AsyncFunctionDef) -> ToolSpec | None:
    doc = ast.get_docstring(node) or ""
    description = doc.strip().split("\n\n")[0].replace("\n", " ").strip()[:2000]

    args = node.args
    positional = args.args
    defaults = args.defaults
    # Map trailing defaults onto their params.
    first_default = len(positional) - len(defaults)
    properties: dict[str, Any] = {}
    required: list[str] = []
    sig_parts: list[str] = []
    for index, arg in enumerate(positional):
        if arg.arg in ("self", "cls"):
            continue
        json_type = _annotation_type(arg.annotation)
        properties[arg.arg] = {"type": json_type}
        has_default = index >= first_default
        if not has_default:
            required.append(arg.arg)
        hint = ast.unparse(arg.annotation) if arg.annotation is not None else None
        sig_parts.append(f"{arg.arg}: {hint}" if hint else arg.arg)
        if len(properties) >= _MAX_PARAMS:
            break

    parameters: dict[str, Any] = {"type": "object", "properties": properties}
    if required:
        parameters["required"] = required

    return ToolSpec(
        name=node.name,
        description=description,
        signature=f"{node.name}({', '.join(sig_parts)})"[:400],
        parameters=parameters,
        dangerous=_is_dangerous(node.name),
    )


def _annotation_type(annotation: ast.expr | None) -> str:
    if annotation is None:
        return "string"
    try:
        text = ast.unparse(annotation)
    except Exception:
        return "string"
    base = text.split("[", 1)[0].strip().split(".")[-1].lower()
    if base.startswith("optional") or base.startswith("union"):
        # Optional[X] / X | None — fall back to string (good enough for schema).
        return "string"
    return _TYPE_MAP.get(base, "string")


def _parse_json_schema(text: str) -> list[ToolSpec]:
    data = json.loads(text)
    entries = data if isinstance(data, list) else data.get("tools") or data.get("functions") or []
    specs: list[ToolSpec] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        # Accept both {"type":"function","function":{...}} and flat {name,parameters}.
        fn = entry.get("function") if isinstance(entry.get("function"), dict) else entry
        name = fn.get("name")
        if not isinstance(name, str) or not name:
            continue
        params = fn.get("parameters")
        params = params if isinstance(params, dict) else {"type": "object", "properties": {}}
        description = str(fn.get("description") or "")[:2000]
        try:
            specs.append(ToolSpec(
                name=name,
                description=description,
                parameters=params,
                dangerous=_is_dangerous(name),
            ))
        except Exception:
            continue
        if len(specs) >= _MAX_TOOLS:
            break
    return specs
