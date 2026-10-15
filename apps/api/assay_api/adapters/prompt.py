from __future__ import annotations

import asyncio
import hashlib
import os
import random
import re
import time
from typing import Any

from ..agent_research import DEFAULT_FAST_MODEL, resolve_openai_key
from ..models import CandidateConfig, CandidateResponse, TokenCounts
from .base import CandidateAdapter, CandidateAdapterError

_MAX_SYSTEM_PROMPT_CHARS = 20000


class _RateLimited(Exception):
    """Raised internally when the OpenAI key stays rate-limited / out of quota
    after the retry budget; mapped to :func:`rate_limit_failure`."""


def rate_limit_failure(detail: str) -> CandidateAdapterError:
    """The error a run fails with when the model cannot be reached.

    Assay never substitutes canned answers for a model it could not call: the
    run stops, is recorded as failed, and says how to recover.
    """
    return CandidateAdapterError(
        "OpenAI rate limit or quota exhausted, so the exam stopped (Assay never "
        "substitutes answers for a model it could not reach). Add billing or raise "
        "the key's limits, lower k (ASSAY_LIVE_K), or raise ASSAY_OPENAI_MAX_RETRIES / "
        f"ASSAY_OPENAI_MAX_RETRY_WAIT_S. Detail: {detail}"
    )


def api_status_failure(status: int | None, detail: str, model: str) -> CandidateAdapterError | None:
    """A clear run failure for OpenAI errors no retry can fix, else ``None``."""
    if status in (401, 403):
        return CandidateAdapterError(
            f"OpenAI rejected the API key ({status}), so the exam stopped. Check OPENAI_API_KEY "
            f"and that the key's project can use the model. Detail: {detail}"
        )
    if status == 404:
        return CandidateAdapterError(
            f"OpenAI model {model!r} was not found or is not available to this key, so the exam "
            f"stopped. Set ASSAY_OPENAI_MODEL (or --model) to a model the key can use. Detail: {detail}"
        )
    return None


def retry_budget() -> tuple[int, float]:
    """(max attempts, max single wait in seconds) for rate-limited calls.

    Generous by default because there is no fallback: a transient 429 burst
    should slow a run down, not kill it.
    """
    attempts = max(1, int(os.environ.get("ASSAY_OPENAI_MAX_RETRIES", "5")))
    max_wait = float(os.environ.get("ASSAY_OPENAI_MAX_RETRY_WAIT_S", "20"))
    return attempts, max_wait


def _retry_after_seconds(exc: Any) -> float | None:
    """Best-effort wait time from a rate-limit error: the ``Retry-After`` header
    if present, else the human hint OpenAI embeds in the message
    (``"try again in 20s"`` / ``"in 1.5s"`` / ``"in 800ms"``)."""
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if headers:
        raw = headers.get("retry-after") or headers.get("Retry-After")
        try:
            if raw is not None:
                return float(raw)
        except (TypeError, ValueError):
            pass
    message = str(getattr(exc, "message", None) or exc)
    match = re.search(r"try again in\s+([\d.]+)\s*(ms|s)", message, re.IGNORECASE)
    if match:
        value = float(match.group(1))
        return value / 1000.0 if match.group(2).lower() == "ms" else value
    return None


class PromptAgentAdapter(CandidateAdapter):
    """Executes a user-supplied agent definition (an ``agent.md`` / ``AGENTS.md``)
    as the candidate under test via OpenAI's ``responses.create``.

    The agent's own markdown drives behaviour: it is sent as the developer/system
    message so the agent's persona, operating principles, and tools take
    precedence over the generic exam framing Assay adds to every ``context``.
    The adapter factory only builds it when an OpenAI key resolves, and it still
    raises if the key disappears mid-run. There is no stand-in answer path.

    Each of the k trials is run at a nonzero temperature with a distinct per-trial
    seed, so repeated asks of the same question genuinely vary — that is what makes
    pass^k a real reliability-under-resampling measure rather than pass^1 repeated.
    """

    # Live LLM calls at temperature > 0 vary per trial, so pass^k is meaningful.
    stochastic = True

    def __init__(self, config: CandidateConfig):
        self.config = config
        system_prompt = (config.system_prompt or "").strip()
        if not system_prompt:
            raise CandidateAdapterError(
                "openai-compatible candidate requires a system_prompt (the agent.md definition)."
            )
        # Defensive size cap before the markdown reaches an LLM call.
        self.system_prompt = system_prompt[:_MAX_SYSTEM_PROMPT_CHARS]
        self.model = config.model or DEFAULT_FAST_MODEL

    async def ask(self, context: str, question: str, trial: int = 1) -> CandidateResponse:
        key = resolve_openai_key()
        if not key:
            raise CandidateAdapterError(
                "No OpenAI key found. Add OPENAI_API_KEY (or openai_key) to the project env "
                "file or the API process environment to run the agent in live mode."
            )

        started = time.perf_counter()
        # The agent's own definition is the developer message so its persona wins;
        # the generic Assay preamble arrives only as user-supplied context that
        # the agent should interpret under its own rules.
        user_message = (
            "Assay screening context (treat as task framing, your own agent "
            "definition above takes precedence):\n"
            f"{context}\n\n"
            f"Question:\n{question}"
        )
        try:
            response = await asyncio.to_thread(self._call_openai, key, user_message, trial)
        except _RateLimited as exc:
            raise rate_limit_failure(str(exc)) from exc

        latency_ms = max(1, int((time.perf_counter() - started) * 1000))

        text = _output_text(response)
        tokens = _token_counts(response, self.system_prompt, context, question, text)
        return CandidateResponse(
            answer=text,
            reasoning="",
            tool_calls=[],
            latency_ms=latency_ms,
            tokens=tokens,
        )

    def _sampling_params(self, trial: int) -> dict[str, Any]:
        """Per-trial sampling so the k trials genuinely differ (real pass^k).

        Temperature drives the variance; a per-trial seed makes each trial
        reproducible where the API honors it. Both are omitted when
        ``ASSAY_OPENAI_TEMPERATURE`` is set to a negative value, for models that
        reject sampling params (e.g. some reasoning models)."""
        temperature = float(os.environ.get("ASSAY_OPENAI_TEMPERATURE", "0.7"))
        if temperature < 0:
            return {}
        seed = int(
            hashlib.sha256(f"{self.config.id}:{self.model}:{trial}".encode("utf-8")).hexdigest()[:8],
            16,
        )
        return {"temperature": temperature, "seed": seed}

    def _call_openai(self, key: str, user_message: str, trial: int = 1) -> Any:
        from openai import APIStatusError, OpenAI, RateLimitError

        timeout_s = float(os.environ.get("ASSAY_OPENAI_TIMEOUT_S", "90"))
        client = OpenAI(api_key=key, timeout=timeout_s)
        sampling = self._sampling_params(trial)
        # Retries with backoff absorb transient 429s. When the budget runs out
        # (exhausted quota, a key far below the run's request rate) we raise
        # _RateLimited and the run fails with an explanation; nothing is faked.
        max_attempts, max_wait = retry_budget()
        if sampling:
            max_attempts = max(max_attempts, 2)
        for attempt in range(1, max_attempts + 1):
            try:
                return client.responses.create(
                    model=self.model,
                    input=[
                        {"role": "developer", "content": self.system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    **sampling,
                )
            except RateLimitError as exc:
                if attempt >= max_attempts:
                    raise _RateLimited(str(getattr(exc, "message", None) or exc)) from exc
                wait = _retry_after_seconds(exc)
                if wait is None:
                    wait = 2.0 ** attempt
                time.sleep(min(max_wait, wait) + random.uniform(0.2, 0.8))
            except APIStatusError as exc:
                status = getattr(exc, "status_code", None)
                message = str(getattr(exc, "message", None) or exc).lower()
                # 429 outside RateLimitError (quota) -> fail the run; 5xx -> retry.
                if status == 429:
                    raise _RateLimited(str(getattr(exc, "message", None) or exc)) from exc
                # A model that rejects temperature/seed (some reasoning models):
                # drop the sampling params and retry once, plain.
                if status == 400 and _is_unsupported_sampling_error(message, sampling):
                    sampling = {}
                    continue
                if status is not None and 500 <= status < 600 and attempt < max_attempts:
                    time.sleep(min(max_wait, 2.0 ** attempt) + random.uniform(0.2, 0.8))
                    continue
                failure = api_status_failure(status, str(getattr(exc, "message", None) or exc), self.model)
                if failure is not None:
                    raise failure from exc
                raise
            except TypeError as exc:
                # Some OpenAI SDK versions reject unsupported kwargs locally
                # before making an HTTP request, so the APIStatusError fallback
                # above never gets a chance to run.
                if _is_unsupported_sampling_error(str(exc), sampling):
                    sampling = {}
                    continue
                raise
        # Unreachable: the loop either returns or raises.
        raise CandidateAdapterError("OpenAI request failed after retries.")


def _output_text(response: Any) -> str:
    """Extract reply text robustly across OpenAI SDK response shapes."""

    text = getattr(response, "output_text", None)
    if text:
        return text
    chunks: list[str] = []
    for item in getattr(response, "output", []) or []:
        for content in getattr(item, "content", []) or []:
            piece = getattr(content, "text", None)
            if piece:
                chunks.append(piece)
    return "".join(chunks)


def _is_unsupported_sampling_error(message: str, sampling: dict[str, Any]) -> bool:
    if not sampling:
        return False
    text = message.lower()
    mentions_sampling = any(key.lower() in text for key in sampling)
    return mentions_sampling and (
        "unexpected keyword argument" in text
        or "unsupported" in text
        or "not supported" in text
    )


def _token_counts(
    response: Any, system_prompt: str, context: str, question: str, answer: str
) -> TokenCounts:
    usage = getattr(response, "usage", None)
    if usage is not None:
        input_tokens = _usage_field(usage, "input_tokens")
        output_tokens = _usage_field(usage, "output_tokens")
        total_tokens = _usage_field(usage, "total_tokens")
        if input_tokens or output_tokens or total_tokens:
            if not total_tokens:
                total_tokens = input_tokens + output_tokens
            return TokenCounts(input=input_tokens, output=output_tokens, total=total_tokens)

    # No usage on the response: estimate ~4 chars per token.
    input_tokens = (len(system_prompt) + len(context) + len(question)) // 4
    output_tokens = len(answer) // 4
    return TokenCounts(
        input=input_tokens,
        output=output_tokens,
        total=input_tokens + output_tokens,
    )


def _usage_field(usage: Any, name: str) -> int:
    value = getattr(usage, name, None)
    if value is None and isinstance(usage, dict):
        value = usage.get(name)
    try:
        return int(value) if value is not None else 0
    except (TypeError, ValueError):
        return 0
