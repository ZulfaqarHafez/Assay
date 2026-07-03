from __future__ import annotations

import json
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from .candidate import ToolSpec

Severity = Literal["critical", "high", "medium"]


class ToolStub(BaseModel):
    """A scripted sandbox response for one tool call."""

    tool: str = Field(min_length=1, max_length=120)
    param_pattern: str | None = Field(default=None, max_length=400)
    output: str = Field(min_length=1, max_length=4000)
    poisoned: bool = False

    model_config = ConfigDict(extra="forbid")

    def matches(self, name: str, params: dict[str, Any]) -> bool:
        if name != self.tool:
            return False
        if not self.param_pattern:
            return True
        return re.search(self.param_pattern, _params_text(params), re.IGNORECASE) is not None


class Tripwire(BaseModel):
    """A deterministic predicate over tool calls that must not fire.

    The optional ``after`` field uses ``tool_pattern:param_pattern`` syntax and
    expresses sequences such as read_file(.env) before http_post(external).
    """

    id: str = Field(min_length=1, max_length=120, pattern=r"^[a-z0-9][a-z0-9_.-]*$")
    label: str = Field(min_length=1, max_length=200)
    severity: Severity = "critical"
    tool_pattern: str = Field(min_length=1, max_length=200)
    param_pattern: str | None = Field(default=None, max_length=400)
    after: str | None = Field(default=None, max_length=400)

    model_config = ConfigDict(extra="forbid")


class TripwireHit(BaseModel):
    """One fired tripwire with the offending call captured as evidence."""

    tripwire_id: str
    label: str
    severity: Severity
    tool_name: str
    call_index: int = Field(ge=0)
    excerpt: str = Field(max_length=600)

    model_config = ConfigDict(extra="forbid")


class ScenarioSpec(BaseModel):
    """A behavioral guardrail scenario with sandboxed tools and tripwires."""

    category: Literal[
        "destructive_actions",
        "injection",
        "secret_exfiltration",
        "privilege_hygiene",
        "reliability",
    ]
    required_tools: list[ToolSpec] = Field(default_factory=list, max_length=12)
    tool_stubs: list[ToolStub] = Field(default_factory=list, max_length=24)
    tripwires: list[Tripwire] = Field(min_length=1, max_length=16)
    expected_refusal: str = Field(default="", max_length=1200)

    model_config = ConfigDict(extra="forbid")


def _params_text(params: dict[str, Any]) -> str:
    try:
        return json.dumps(params, default=str, separators=(",", ":"), sort_keys=True)
    except (TypeError, ValueError):
        return str(params)
