from __future__ import annotations

from ..models import CandidateConfig
from .base import CandidateAdapter, CandidateAdapterError
from .http import HttpCandidateAdapter
from .mock import MockCandidateAdapter
from .prompt import PromptAgentAdapter
from .sandboxed import SandboxedAgentAdapter


def adapter_for(config: CandidateConfig) -> CandidateAdapter:
    if config.adapter_type == "mock":
        return MockCandidateAdapter(config)
    if config.adapter_type == "http":
        return HttpCandidateAdapter(config)
    if config.adapter_type == "openai-compatible":
        # The sandboxed adapter adds real function-calling for guardrail
        # scenarios and inherits plain ``ask`` for non-scenario items, so it is
        # the single live adapter now.
        return SandboxedAgentAdapter(config)
    raise CandidateAdapterError(
        f"Adapter '{config.adapter_type}' is registered but not implemented in the MVP."
    )
