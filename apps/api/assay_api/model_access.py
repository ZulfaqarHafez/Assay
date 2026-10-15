"""Whether a guardrail exam can run, and the one message that says why not.

Assay has no stand-in grader. An exam needs something real to answer the
probes: an OpenAI model playing the agent definition (``openai-compatible``),
or the user's own agent behind an HTTP endpoint (``http``). When neither is
available the exam refuses up front, everywhere (HTTP API, CLI, SDK, MCP, web)
with the same message, and static lint stays available because it needs no
model.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .adapters.base import CandidateAdapterError
from .agent_research import resolve_openai_key

if TYPE_CHECKING:  # pragma: no cover
    from .models import CandidateConfig

EXAM_NEEDS_MODEL = (
    "The guardrail exam needs a real model to play the agent: set OPENAI_API_KEY on the "
    "Assay server (or in a root .env) and make sure ASSAY_DISABLE_OPENAI is not set. "
    "Static lint works without a key."
)

LEGACY_MOCK_CANDIDATE = (
    "This candidate was registered for the removed mock grader and cannot be examined. "
    "Register the agent definition again (POST /candidates/from-markdown) to run the "
    "real exam."
)


class ModelUnavailableError(CandidateAdapterError):
    """Raised before a run starts when nothing real can answer the exam."""


def exam_unavailable_reason(candidate: CandidateConfig | None = None) -> str | None:
    """``None`` when the exam can run for ``candidate``; otherwise the reason."""
    adapter_type = candidate.adapter_type if candidate is not None else "openai-compatible"
    if adapter_type == "mock":
        return LEGACY_MOCK_CANDIDATE
    if adapter_type == "http":
        # The user's own agent answers; it brings its own model.
        return None
    if not resolve_openai_key():
        return EXAM_NEEDS_MODEL
    return None


def exam_available(candidate: CandidateConfig | None = None) -> bool:
    return exam_unavailable_reason(candidate) is None


def require_exam_model(candidate: CandidateConfig | None = None) -> None:
    reason = exam_unavailable_reason(candidate)
    if reason is not None:
        raise ModelUnavailableError(reason)
