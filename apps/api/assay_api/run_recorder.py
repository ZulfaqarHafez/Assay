from __future__ import annotations

from typing import Any

from .database import save_event
from .models import CandidateConfig, CandidateResponse, RunEvent


class RunRecorder:
    """Owns event emission and TraceRazor trace-step capture for one run.

    Extracted from :class:`~assay_api.orchestrator.RunOrchestrator` so the
    recording concern — monotonic sequence numbers, persisted event spans, and
    the candidate-only trace slice handed to TraceRazor — is separable and
    unit-testable apart from the run/grading pipeline. One instance is created
    per run; it holds the per-run counters and the accumulating trace steps.
    """

    # Cap recorded step content well above the prior 500-char limit so the
    # TraceRazor audit sees the candidate's real reasoning plus a substantive
    # slice of the answer instead of a truncated placeholder. Kept bounded so
    # very long answers do not bloat the trace payload sent to the auditor.
    _STEP_CONTENT_CAP = 1200

    def __init__(self) -> None:
        self._sequence = 0
        self._trace_step_id = 0
        self._trace_steps: list[dict[str, Any]] = []

    @property
    def trace_steps(self) -> list[dict[str, Any]]:
        """The candidate-only trace slice accumulated so far, in order."""
        return self._trace_steps

    def event(
        self,
        run_id: str,
        actor: RunEvent.model_fields["actor"].annotation,
        event_type: str,
        payload: dict[str, Any],
        tracerazor_step_id: int | None = None,
    ) -> RunEvent:
        self._sequence += 1
        event = RunEvent(
            run_id=run_id,
            sequence=self._sequence,
            actor=actor,
            event_type=event_type,
            payload=payload,
            ended_at=None,
            tracerazor_step_id=tracerazor_step_id,
        )
        return save_event(event)

    def record_reasoning_step(
        self,
        candidate: CandidateConfig,
        response: CandidateResponse,
        question: str,
        competency: str,
        trial: int,
        variant: str,
    ) -> int:
        self._trace_step_id += 1
        self._trace_steps.append(
            {
                "id": self._trace_step_id,
                "type": "reasoning",
                "content": self._reasoning_content(response),
                "tokens": self._step_tokens(response.tokens.total, response.answer, response.reasoning),
                "input_context": question,
                "output": response.answer,
                "agent_id": candidate.id,
                "metadata": {"competency": competency, "trial": trial, "variant": variant},
            }
        )
        return self._trace_step_id

    def record_tool_step(self, tool: dict[str, Any], question: str) -> int:
        self._trace_step_id += 1
        name = tool.get("name", "tool")
        params = tool.get("params") or {}
        output = tool.get("output")
        self._trace_steps.append(
            {
                "id": self._trace_step_id,
                "type": "tool_call",
                "content": self._tool_content(name, params, output),
                "tokens": self._step_tokens(tool.get("tokens"), str(output or ""), str(params)),
                "tool_name": tool.get("name"),
                "tool_params": params,
                "tool_success": bool(tool.get("success", True)),
                "tool_error": tool.get("error"),
                "input_context": question,
                "output": output,
            }
        )
        return self._trace_step_id

    def _reasoning_content(self, response: CandidateResponse) -> str:
        """Build a faithful, information-rich step body.

        Combine the candidate's reasoning with a slice of the answer so the
        audit never sees an empty/placeholder step. Falls back gracefully when
        only one of the two is present.
        """
        reasoning = (response.reasoning or "").strip()
        answer = (response.answer or "").strip()
        parts: list[str] = []
        if reasoning:
            parts.append(f"Reasoning: {reasoning}")
        if answer:
            parts.append(f"Answer: {answer}")
        content = "\n".join(parts) if parts else "(no content reported)"
        return content[: self._STEP_CONTENT_CAP]

    def _tool_content(self, name: str, params: dict[str, Any], output: Any) -> str:
        content = f"Calling {name}"
        if params:
            content += f" with {params}"
        if output:
            content += f" -> {output}"
        return content[: self._STEP_CONTENT_CAP]

    @staticmethod
    def _step_tokens(reported: Any, *text_fields: str) -> int:
        """Return a faithful per-step token count.

        Prefer the real count an adapter reports (mock and HTTP candidates both
        emit genuine counts). Only fall back to a deterministic ~4-chars/token
        estimate over the step's own text when no real count exists, so a step
        is never collapsed to the misleading ``tokens=1`` placeholder.
        """
        try:
            real = int(reported) if reported is not None else 0
        except (TypeError, ValueError):
            real = 0
        if real > 0:
            return real
        estimate = sum(len(field or "") for field in text_fields) // 4
        return max(estimate, 1)
