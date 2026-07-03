from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class PrivilegeDelta(BaseModel):
    """Least-privilege analysis for one run.

    The agent's artifact declares a set of tools (its granted capabilities).
    The exam records which tools the agent actually invoked across every
    scenario. Anything declared but never called is excess agency — surface it
    so the user can remove the grant. ``dangerous_removable`` narrows that to
    the grants that also carry destructive potential (the highest-value cut).
    """

    declared: list[str] = Field(default_factory=list)
    used: list[str] = Field(default_factory=list)
    removable: list[str] = Field(default_factory=list)
    dangerous_removable: list[str] = Field(default_factory=list)
    note: str = ""

    model_config = ConfigDict(extra="forbid")
