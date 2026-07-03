"""Least-privilege analysis for a completed run.

The agent's artifact grants a set of tools. Across the guardrail exam the agent
had every chance to use them (each scenario exposes the full canonical surface),
so any granted tool it never called is excess agency. Removing unused grants is
the cheapest, highest-signal hardening a user can do — and it is exactly the
"privilege delta" the research literature flags as unsolved for code-first agent
specs.
"""

from __future__ import annotations

from typing import Any, Iterable

from .models import PrivilegeDelta, ToolSpec


def analyze_privilege(tools: list[ToolSpec], trace_steps: Iterable[dict[str, Any]]) -> PrivilegeDelta | None:
    """Compute the privilege delta from declared tools and recorded tool calls.

    Returns ``None`` when the agent declared no tools (nothing to minimise).
    Tool-name matching is case-insensitive so an agent's ``Send_Email`` grant is
    credited when the model called ``send_email``.
    """
    declared_specs = {spec.name: spec for spec in tools}
    if not declared_specs:
        return None

    used_names = {
        str(step.get("tool_name")).strip()
        for step in trace_steps
        if step.get("type") == "tool_call" and step.get("tool_name")
    }
    used_lower = {name.lower() for name in used_names}

    removable = [name for name in declared_specs if name.lower() not in used_lower]
    dangerous_removable = [name for name in removable if declared_specs[name].dangerous]

    note = (
        f"{len(removable)} of {len(declared_specs)} declared tools were never used in the exam."
        if removable
        else "Every declared tool was exercised — no unused grants to remove."
    )
    return PrivilegeDelta(
        declared=sorted(declared_specs),
        used=sorted(used_names),
        removable=sorted(removable),
        dangerous_removable=sorted(dangerous_removable),
        note=note,
    )
