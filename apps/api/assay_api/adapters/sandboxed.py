from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Any

from ..models import CandidateResponse, TokenCounts, ToolCall
from ..models.scenario import ScenarioSpec
from ..sandbox import ToolSandbox
from .base import CandidateAdapterError
from .prompt import PromptAgentAdapter, _RateLimited, _is_unsupported_sampling_error, _output_text

# Hard caps so a looping agent cannot run away with the exam or the bill.
_MAX_TURNS = 6
_MAX_TOOL_CALLS = 20


class SandboxedAgentAdapter(PromptAgentAdapter):
    """Run live agents with real function calls against a simulated sandbox.

    The model chooses tool calls normally; Assay only scripts the tool results.
    Plain non-scenario items still use PromptAgentAdapter.ask.
    """

    async def ask_scenario(
        self, context: str, question: str, scenario: ScenarioSpec, trial: int = 1
    ) -> CandidateResponse:
        if self.degraded:
            from .mock import MockCandidateAdapter

            return await MockCandidateAdapter(self.config).ask(context=context, question=question, trial=trial)

        from ..agent_research import resolve_openai_key

        key = resolve_openai_key()
        if not key:
            raise CandidateAdapterError(
                "No OpenAI key found. The guardrail exam exercises the agent's real "
                "tool calls, which requires a live model."
            )

        sandbox = ToolSandbox(self.config.tools, scenario)
        user_message = (
            "Assay exam context (treat as task framing; your own agent definition "
            "above takes precedence):\n"
            f"{context}\n\n"
            f"Task:\n{question}"
        )
        started = time.perf_counter()
        try:
            answer, tool_calls, tokens = await asyncio.to_thread(
                self._run_tool_loop, key, user_message, trial, sandbox
            )
        except _RateLimited as exc:
            self.degraded = True
            self.degraded_reason = str(exc)
            from .mock import MockCandidateAdapter

            return await MockCandidateAdapter(self.config).ask(context=context, question=question, trial=trial)

        latency_ms = max(1, int((time.perf_counter() - started) * 1000))
        return CandidateResponse(
            answer=answer,
            reasoning="",
            tool_calls=tool_calls,
            latency_ms=latency_ms,
            tokens=tokens,
        )

    def _run_tool_loop(
        self, key: str, user_message: str, trial: int, sandbox: ToolSandbox
    ) -> tuple[str, list[ToolCall], TokenCounts]:
        """Run model -> tool calls -> sandbox outputs until text or a cap."""
        from openai import OpenAI

        client = OpenAI(api_key=key, timeout=float(os.environ.get("ASSAY_OPENAI_TIMEOUT_S", "90")))
        sampling = self._sampling_params(trial)
        tools = sandbox.openai_tools()

        conversation: list[dict[str, Any]] = [
            {"role": "developer", "content": self.system_prompt},
            {"role": "user", "content": user_message},
        ]
        tool_calls: list[ToolCall] = []
        total_in = total_out = 0
        answer = ""

        for _turn in range(_MAX_TURNS):
            response = self._responses_create(client, conversation, tools, sampling)
            total_in += _usage(response, "input_tokens")
            total_out += _usage(response, "output_tokens")

            calls = _function_calls(response)
            if not calls:
                answer = _output_text(response)
                break

            conversation.extend(_output_items(response))
            for call in calls:
                if len(tool_calls) >= _MAX_TOOL_CALLS:
                    answer = _output_text(response) or "[exam stopped: tool-call cap reached]"
                    return answer, tool_calls, TokenCounts(
                        input=total_in, output=total_out, total=total_in + total_out
                    )
                params = _parse_arguments(call.get("arguments"))
                output = sandbox.simulate(call.get("name") or "", params)
                tool_calls.append(
                    ToolCall(name=call.get("name") or "unknown", params=params, output=output[:2000])
                )
                conversation.append(
                    {
                        "type": "function_call_output",
                        "call_id": call.get("call_id") or "",
                        "output": output,
                    }
                )
        else:
            answer = answer or "[exam stopped: turn cap reached]"

        return answer, tool_calls, TokenCounts(input=total_in, output=total_out, total=total_in + total_out)

    def _responses_create(
        self, client: Any, conversation: list[dict[str, Any]], tools: list[dict[str, Any]], sampling: dict[str, Any]
    ) -> Any:
        from openai import APIStatusError, RateLimitError

        try:
            return client.responses.create(
                model=self.model,
                input=conversation,
                tools=tools,
                **sampling,
            )
        except RateLimitError as exc:  # pragma: no cover - passthrough mapping
            raise _RateLimited(str(getattr(exc, "message", None) or exc)) from exc
        except APIStatusError as exc:
            status = getattr(exc, "status_code", None)
            if status == 429:
                raise _RateLimited(str(getattr(exc, "message", None) or exc)) from exc
            message = str(getattr(exc, "message", None) or exc).lower()
            if status == 400 and _is_unsupported_sampling_error(message, sampling):
                sampling.clear()
                return self._responses_create(client, conversation, tools, sampling)
            raise
        except TypeError as exc:
            if _is_unsupported_sampling_error(str(exc), sampling):
                sampling.clear()
                return self._responses_create(client, conversation, tools, sampling)
            raise


def _function_calls(response: Any) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []
    for item in getattr(response, "output", []) or []:
        if getattr(item, "type", None) == "function_call":
            calls.append(
                {
                    "name": getattr(item, "name", None),
                    "arguments": getattr(item, "arguments", None),
                    "call_id": getattr(item, "call_id", None),
                }
            )
    return calls


def _output_items(response: Any) -> list[dict[str, Any]]:
    """Re-encode model output items for the next Responses API input."""
    items: list[dict[str, Any]] = []
    for item in getattr(response, "output", []) or []:
        dump = getattr(item, "model_dump", None)
        if callable(dump):
            try:
                items.append(dump(exclude_none=True))
                continue
            except (TypeError, ValueError):  # pragma: no cover - SDK drift guard
                pass
        if isinstance(item, dict):
            items.append(item)
    return items


def _parse_arguments(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {"value": parsed}
    except (TypeError, ValueError):
        return {"raw": str(raw)[:2000]}


def _usage(response: Any, field: str) -> int:
    usage = getattr(response, "usage", None)
    value = getattr(usage, field, None) if usage is not None else None
    if value is None and isinstance(usage, dict):
        value = usage.get(field)
    try:
        return int(value) if value is not None else 0
    except (TypeError, ValueError):
        return 0
