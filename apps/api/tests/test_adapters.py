from __future__ import annotations

import socket
import sys
import types

import httpx
import pytest

from assay_api.adapters import CandidateAdapterError, HttpCandidateAdapter
from assay_api.models import CandidateConfig


@pytest.fixture(autouse=True)
def _candidate_test_resolves_publicly(monkeypatch: pytest.MonkeyPatch) -> None:
    original = socket.getaddrinfo

    def fake_getaddrinfo(host, port, *args, **kwargs):
        if host == "candidate.test":
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port or 80))]
        return original(host, port, *args, **kwargs)

    monkeypatch.setattr("assay_api.network_guard.socket.getaddrinfo", fake_getaddrinfo)


def test_prompt_adapter_varies_sampling_per_trial() -> None:
    from assay_api.adapters.prompt import PromptAgentAdapter

    assert PromptAgentAdapter.stochastic is True
    config = CandidateConfig(
        id="cand_live", name="Live", adapter_type="openai-compatible", system_prompt="# Agent\nDo the job."
    )
    adapter = PromptAgentAdapter(config)

    p1 = adapter._sampling_params(1)
    p2 = adapter._sampling_params(2)

    # Nonzero temperature drives real per-trial variance; the seed differs by trial
    # so pass^k measures reliability under resampling, not pass^1 repeated.
    assert p1["temperature"] > 0
    assert p1["seed"] != p2["seed"]


def test_prompt_adapter_omits_sampling_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    from assay_api.adapters.prompt import PromptAgentAdapter

    monkeypatch.setenv("ASSAY_OPENAI_TEMPERATURE", "-1")
    config = CandidateConfig(
        id="cand_live", name="Live", adapter_type="openai-compatible", system_prompt="# Agent\nDo the job."
    )
    adapter = PromptAgentAdapter(config)

    assert adapter._sampling_params(1) == {}


def test_prompt_adapter_retries_without_sampling_when_sdk_rejects_seed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from assay_api.adapters.prompt import PromptAgentAdapter

    calls: list[dict] = []

    class FakeRateLimitError(Exception):
        pass

    class FakeAPIStatusError(Exception):
        pass

    class FakeResponses:
        def create(self, **kwargs):
            calls.append(kwargs)
            if "seed" in kwargs:
                raise TypeError("Responses.create() got an unexpected keyword argument 'seed'")
            return types.SimpleNamespace(output_text="ok")

    class FakeOpenAI:
        def __init__(self, **_: object):
            self.responses = FakeResponses()

    monkeypatch.setitem(
        sys.modules,
        "openai",
        types.SimpleNamespace(
            APIStatusError=FakeAPIStatusError,
            OpenAI=FakeOpenAI,
            RateLimitError=FakeRateLimitError,
        ),
    )

    config = CandidateConfig(
        id="cand_live",
        name="Live",
        adapter_type="openai-compatible",
        system_prompt="# Agent\nDo the job.",
    )
    adapter = PromptAgentAdapter(config)

    response = adapter._call_openai("test-key", "question", trial=1)

    assert response.output_text == "ok"
    assert "seed" in calls[0]
    assert "temperature" in calls[0]
    assert "seed" not in calls[1]
    assert "temperature" not in calls[1]


def test_sandboxed_adapter_retries_without_sampling_when_sdk_rejects_seed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from assay_api.adapters.sandboxed import SandboxedAgentAdapter

    calls: list[dict] = []

    class FakeRateLimitError(Exception):
        pass

    class FakeAPIStatusError(Exception):
        pass

    class FakeResponses:
        def create(self, **kwargs):
            calls.append(kwargs)
            if "seed" in kwargs:
                raise TypeError("Responses.create() got an unexpected keyword argument 'seed'")
            return types.SimpleNamespace(output=[], output_text="ok")

    monkeypatch.setitem(
        sys.modules,
        "openai",
        types.SimpleNamespace(APIStatusError=FakeAPIStatusError, RateLimitError=FakeRateLimitError),
    )

    config = CandidateConfig(
        id="cand_live",
        name="Live",
        adapter_type="openai-compatible",
        system_prompt="# Agent\nDo the job.",
    )
    adapter = SandboxedAgentAdapter(config)

    response = adapter._responses_create(
        types.SimpleNamespace(responses=FakeResponses()),
        conversation=[],
        tools=[],
        sampling={"temperature": 0.7, "seed": 123},
    )

    assert response.output_text == "ok"
    assert "seed" in calls[0]
    assert "temperature" in calls[0]
    assert "seed" not in calls[1]
    assert "temperature" not in calls[1]


@pytest.mark.asyncio
async def test_http_adapter_parses_candidate_response() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/ask"
        return httpx.Response(
            200,
            json={
                "answer": "Use job-related evidence.",
                "reasoning": "Protected traits are irrelevant.",
                "tokens": {"input": 4, "output": 6, "total": 10},
                "tool_calls": [{"name": "lookup", "params": {}, "success": True, "tokens": 3}],
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://candidate.test")
    config = CandidateConfig(name="HTTP", adapter_type="http", endpoint_url="http://candidate.test/ask")
    adapter = HttpCandidateAdapter(config, client=client)
    response = await adapter.ask(context="ctx", question="q")

    assert response.answer == "Use job-related evidence."
    assert response.tokens.total == 10
    assert response.tool_calls[0].name == "lookup"
    await client.aclose()


@pytest.mark.asyncio
async def test_http_adapter_reports_http_errors() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "bad"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://candidate.test")
    config = CandidateConfig(name="HTTP", adapter_type="http", endpoint_url="http://candidate.test/ask")
    adapter = HttpCandidateAdapter(config, client=client)

    with pytest.raises(CandidateAdapterError):
        await adapter.ask(context="ctx", question="q")
    await client.aclose()


@pytest.mark.asyncio
async def test_http_adapter_rejects_private_endpoint_from_stored_config() -> None:
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200)))
    config = CandidateConfig.model_construct(
        id="cand_legacy",
        name="Legacy HTTP",
        adapter_type="http",
        endpoint_url="http://127.0.0.1:9000/ask",
        metadata={},
    )

    with pytest.raises(CandidateAdapterError, match="public IP"):
        HttpCandidateAdapter(config, client=client)
    await client.aclose()


@pytest.mark.asyncio
async def test_http_adapter_raises_on_timeout() -> None:
    """A timed-out request is surfaced as a CandidateAdapterError, not a leak."""

    async def handler(_: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("read timed out", request=None)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://candidate.test")
    config = CandidateConfig(name="HTTP", adapter_type="http", endpoint_url="http://candidate.test/ask")
    adapter = HttpCandidateAdapter(config, client=client)

    with pytest.raises(CandidateAdapterError):
        await adapter.ask(context="ctx", question="q")
    await client.aclose()


@pytest.mark.asyncio
async def test_http_adapter_rejects_oversize_response(monkeypatch) -> None:
    monkeypatch.setenv("ASSAY_HTTP_CANDIDATE_MAX_BYTES", "64")
    big_answer = "x" * 4096

    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"answer": big_answer, "reasoning": "ok"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://candidate.test")
    config = CandidateConfig(name="HTTP", adapter_type="http", endpoint_url="http://candidate.test/ask")
    adapter = HttpCandidateAdapter(config, client=client)

    with pytest.raises(CandidateAdapterError) as excinfo:
        await adapter.ask(context="ctx", question="q")
    assert "limit" in str(excinfo.value)
    await client.aclose()


@pytest.mark.asyncio
async def test_http_adapter_rejects_non_object_json() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=["not", "an", "object"])

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://candidate.test")
    config = CandidateConfig(name="HTTP", adapter_type="http", endpoint_url="http://candidate.test/ask")
    adapter = HttpCandidateAdapter(config, client=client)

    with pytest.raises(CandidateAdapterError):
        await adapter.ask(context="ctx", question="q")
    await client.aclose()


@pytest.mark.asyncio
async def test_http_adapter_rejects_invalid_response_shape() -> None:
    """Malformed tool_calls/tokens are rejected with a CandidateAdapterError."""

    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "answer": "ok",
                "tokens": {"input": "not-a-number"},
                "tool_calls": [{"params": {}}],  # missing required "name"
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://candidate.test")
    config = CandidateConfig(name="HTTP", adapter_type="http", endpoint_url="http://candidate.test/ask")
    adapter = HttpCandidateAdapter(config, client=client)

    with pytest.raises(CandidateAdapterError):
        await adapter.ask(context="ctx", question="q")
    await client.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {"answer": "x" * 20001, "reasoning": "ok"},
        {"answer": "ok", "reasoning": "x" * 20001},
        {"answer": "ok", "tool_calls": [{"name": f"tool{i}", "params": {}} for i in range(21)]},
        {"answer": "ok", "tool_calls": [{"name": "lookup", "params": {"blob": "x" * 9000}}]},
        {"answer": "ok", "tokens": {"total": -1}},
    ],
)
async def test_http_adapter_rejects_unbounded_candidate_payloads(payload: dict) -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://candidate.test")
    config = CandidateConfig(name="HTTP", adapter_type="http", endpoint_url="http://candidate.test/ask")
    adapter = HttpCandidateAdapter(config, client=client)

    with pytest.raises(CandidateAdapterError, match="invalid response shape"):
        await adapter.ask(context="ctx", question="q")
    await client.aclose()


# --- No stand-in answers: rate limits fail the run, missing models refuse it ---


def _fake_openai(monkeypatch: pytest.MonkeyPatch, responses_factory) -> type:
    class FakeRateLimitError(Exception):
        pass

    class FakeAPIStatusError(Exception):
        pass

    class FakeOpenAI:
        def __init__(self, **_: object):
            self.responses = responses_factory(FakeRateLimitError)

    monkeypatch.setitem(
        sys.modules,
        "openai",
        types.SimpleNamespace(APIStatusError=FakeAPIStatusError, OpenAI=FakeOpenAI, RateLimitError=FakeRateLimitError),
    )
    return FakeRateLimitError


@pytest.mark.asyncio
async def test_prompt_adapter_fails_instead_of_substituting_answers_when_rate_limited(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from assay_api.adapters.prompt import PromptAgentAdapter

    calls: list[int] = []

    def responses(rate_limit_error):
        class AlwaysLimited:
            def create(self, **_kwargs):
                calls.append(1)
                raise rate_limit_error("Rate limit reached. Please try again in 1ms.")

        return AlwaysLimited()

    _fake_openai(monkeypatch, responses)
    monkeypatch.setenv("ASSAY_OPENAI_MAX_RETRIES", "3")
    monkeypatch.setattr("assay_api.adapters.prompt.time.sleep", lambda _s: None)
    monkeypatch.setattr("assay_api.adapters.prompt.resolve_openai_key", lambda: "sk-test")
    adapter = PromptAgentAdapter(
        CandidateConfig(name="Live", adapter_type="openai-compatible", system_prompt="# Agent\nDo the job.")
    )

    with pytest.raises(CandidateAdapterError, match="never substitutes answers"):
        await adapter.ask(context="ctx", question="q")
    assert len(calls) == 3  # the full retry budget was spent before failing
    assert not hasattr(adapter, "degraded")


def test_sandboxed_adapter_retries_a_transient_rate_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    from assay_api.adapters.sandboxed import SandboxedAgentAdapter

    attempts: list[int] = []

    class RateLimited(Exception):
        pass

    class FlakyResponses:
        def create(self, **_kwargs):
            attempts.append(1)
            if len(attempts) == 1:
                raise RateLimited("Rate limit reached. Please try again in 1ms.")
            return types.SimpleNamespace(output=[], output_text="done")

    monkeypatch.setitem(
        sys.modules, "openai", types.SimpleNamespace(APIStatusError=type("E", (Exception,), {}), RateLimitError=RateLimited)
    )
    monkeypatch.setattr("assay_api.adapters.sandboxed.time.sleep", lambda _s: None)
    adapter = SandboxedAgentAdapter(
        CandidateConfig(name="Live", adapter_type="openai-compatible", system_prompt="# Agent\nDo the job.")
    )

    response = adapter._responses_create(
        types.SimpleNamespace(responses=FlakyResponses()), conversation=[], tools=[], sampling={}
    )

    assert response.output_text == "done"
    assert len(attempts) == 2


@pytest.mark.asyncio
async def test_sandboxed_scenario_fails_instead_of_substituting_answers(monkeypatch: pytest.MonkeyPatch) -> None:
    from assay_api.adapters.sandboxed import SandboxedAgentAdapter
    from assay_api.exam_packs import get_exam_pack

    def responses(rate_limit_error):
        class AlwaysLimited:
            def create(self, **_kwargs):
                raise rate_limit_error("quota exhausted")

        return AlwaysLimited()

    _fake_openai(monkeypatch, responses)
    monkeypatch.setenv("ASSAY_OPENAI_MAX_RETRIES", "2")
    monkeypatch.setattr("assay_api.adapters.sandboxed.time.sleep", lambda _s: None)
    monkeypatch.setattr("assay_api.agent_research.resolve_openai_key", lambda: "sk-test")
    scenario = next(item.scenario for item in get_exam_pack("guardrail-v1").items if item.scenario is not None)
    adapter = SandboxedAgentAdapter(
        CandidateConfig(name="Live", adapter_type="openai-compatible", system_prompt="# Agent\nDo the job.")
    )

    with pytest.raises(CandidateAdapterError, match="never substitutes answers"):
        await adapter.ask_scenario(context="ctx", question="Clean up prod.", scenario=scenario)


@pytest.mark.no_model
def test_factory_refuses_an_openai_candidate_without_a_key() -> None:
    from assay_api.adapters import adapter_for
    from assay_api.model_access import EXAM_NEEDS_MODEL, ModelUnavailableError

    config = CandidateConfig(name="Live", adapter_type="openai-compatible", system_prompt="# Agent")
    with pytest.raises(ModelUnavailableError) as excinfo:
        adapter_for(config)
    assert str(excinfo.value) == EXAM_NEEDS_MODEL


@pytest.mark.no_model
def test_factory_refuses_legacy_mock_candidates_even_with_a_key(monkeypatch: pytest.MonkeyPatch) -> None:
    from assay_api.adapters import adapter_for
    from assay_api.model_access import LEGACY_MOCK_CANDIDATE, ModelUnavailableError

    monkeypatch.setattr("assay_api.model_access.resolve_openai_key", lambda: "sk-test")
    with pytest.raises(ModelUnavailableError) as excinfo:
        adapter_for(CandidateConfig(name="Old demo", adapter_type="mock"))
    assert str(excinfo.value) == LEGACY_MOCK_CANDIDATE


@pytest.mark.no_model
def test_factory_builds_http_candidates_without_a_model_key() -> None:
    from assay_api.adapters import adapter_for

    adapter = adapter_for(
        CandidateConfig(name="HTTP", adapter_type="http", endpoint_url="http://candidate.test/ask")
    )
    assert isinstance(adapter, HttpCandidateAdapter)


@pytest.mark.asyncio
async def test_http_adapter_accepts_the_trial_and_forwards_it() -> None:
    seen: list[dict] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        import json as _json

        seen.append(_json.loads(request.content))
        return httpx.Response(200, json={"answer": "I will not run that."})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://candidate.test")
    adapter = HttpCandidateAdapter(
        CandidateConfig(name="HTTP", adapter_type="http", endpoint_url="http://candidate.test/ask"), client=client
    )
    response = await adapter.ask(context="ctx", question="q", trial=3)

    assert response.answer == "I will not run that."
    assert seen[0]["trial"] == 3
    assert HttpCandidateAdapter.stochastic is True
    await client.aclose()


@pytest.mark.parametrize(
    ("status", "needle"),
    [(401, "rejected the API key"), (403, "rejected the API key"), (404, "was not found")],
)
def test_unfixable_openai_errors_become_clear_run_failures(monkeypatch: pytest.MonkeyPatch, status: int, needle: str) -> None:
    from assay_api.adapters.sandboxed import SandboxedAgentAdapter

    class FakeAPIStatusError(Exception):
        def __init__(self, message: str):
            super().__init__(message)
            self.status_code = status
            self.message = message

    class Rejecting:
        def create(self, **_kwargs):
            raise FakeAPIStatusError("Incorrect API key provided")

    monkeypatch.setitem(
        sys.modules, "openai", types.SimpleNamespace(APIStatusError=FakeAPIStatusError, RateLimitError=type("R", (Exception,), {}))
    )
    adapter = SandboxedAgentAdapter(
        CandidateConfig(name="Live", adapter_type="openai-compatible", system_prompt="# Agent", model="gpt-x")
    )
    with pytest.raises(CandidateAdapterError, match=needle):
        adapter._responses_create(types.SimpleNamespace(responses=Rejecting()), conversation=[], tools=[], sampling={})
