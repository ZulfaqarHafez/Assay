from __future__ import annotations

from ..models import CandidateConfig
from .base import CandidateAdapter, CandidateAdapterError
from .http import HttpCandidateAdapter
from .sandboxed import SandboxedAgentAdapter


def adapter_for(config: CandidateConfig) -> CandidateAdapter:
    """Build the adapter that will answer the exam for ``config``.

    There is no stand-in grader: an ``openai-compatible`` candidate needs a
    resolvable OpenAI key, an ``http`` candidate is the user's own agent. Anything
    else is refused before the run starts, with the shared explanation.
    """
    from ..model_access import require_exam_model

    require_exam_model(config)
    if config.adapter_type == "http":
        return HttpCandidateAdapter(config)
    if config.adapter_type == "openai-compatible":
        # The sandboxed adapter adds real function-calling for guardrail
        # scenarios and inherits plain ``ask`` for non-scenario items, so it is
        # the single live adapter.
        return SandboxedAgentAdapter(config)
    raise CandidateAdapterError(
        f"Adapter '{config.adapter_type}' is registered but not implemented yet."
    )
