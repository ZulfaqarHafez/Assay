from __future__ import annotations

import difflib
from typing import Any


def unified_diff_text(original: str, refined: str) -> str:
    """Unified diff between the uploaded agent definition and the refinery output.

    Shared by the CLI `improve` command and the run diff endpoint so both
    surfaces show the same patch.
    """
    return "\n".join(
        difflib.unified_diff(
            original.splitlines(),
            refined.splitlines(),
            fromfile="original/agent.md",
            tofile="refined/AGENTS.md",
            lineterm="",
        )
    )


def diff_payload(run_id: str) -> dict[str, Any] | None:
    """Structured diff for a run's refined agent markdown.

    Returns ``None`` when the run is missing or has no completed agent spec
    yet. When the candidate has no stored original (e.g. the seeded demo
    candidate), ``original_available`` is False and the diff is pure
    additions against an empty file.
    """
    from .agent_refinery import agent_spec_payload
    from .database import get_candidate, get_run

    run = get_run(run_id)
    if run is None:
        return None
    spec = agent_spec_payload(run_id)
    if spec is None:
        return None
    candidate = get_candidate(run.candidate_id)
    original = (candidate.system_prompt if candidate else "") or ""
    refined = str(spec.get("agent_markdown") or "")
    unified = unified_diff_text(original, refined)
    hunks, added, removed = _parse_hunks(unified)
    return {
        "schema": "assay.agent_diff.v1",
        "run_id": run_id,
        "original_available": bool(original.strip()),
        "from_label": "original/agent.md",
        "to_label": "refined/AGENTS.md",
        "unified": unified,
        "hunks": hunks,
        "added": added,
        "removed": removed,
    }


def _parse_hunks(unified: str) -> tuple[list[dict[str, Any]], int, int]:
    hunks: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    added = 0
    removed = 0
    for line in unified.splitlines():
        if line.startswith("---") or line.startswith("+++"):
            continue
        if line.startswith("@@"):
            current = {"header": line, "lines": []}
            hunks.append(current)
            continue
        if current is None:
            continue
        if line.startswith("+"):
            op = "+"
            added += 1
        elif line.startswith("-"):
            op = "-"
            removed += 1
        else:
            op = " "
        current["lines"].append({"op": op, "text": line[1:]})
    return hunks, added, removed
