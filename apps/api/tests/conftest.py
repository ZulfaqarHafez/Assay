from __future__ import annotations

import os
from pathlib import Path

import pytest

# Captured before any fixture scrubs the environment, so ``live`` tests can use
# the real key while every other test stays hermetic.
_REAL_OPENAI_KEY = next(
    (os.environ[name].strip() for name in ("OPENAI_API_KEY", "OPENAI_KEY", "openai_key") if os.environ.get(name, "").strip()),
    "",
)


@pytest.fixture(autouse=True)
def isolated_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, request: pytest.FixtureRequest) -> None:
    monkeypatch.setenv("ASSAY_DB_PATH", str(tmp_path / "assay-test.db"))
    monkeypatch.delenv("ASSAY_DB_BACKEND", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.delenv("ASSAY_REQUIRE_TENANT", raising=False)
    monkeypatch.delenv("ASSAY_TENANT_API_KEYS", raising=False)
    monkeypatch.delenv("ASSAY_DEFAULT_TENANT", raising=False)
    monkeypatch.delenv("ASSAY_PUBLIC_BROWSER_API", raising=False)
    monkeypatch.delenv("ASSAY_TRUST_PROXY_HEADERS", raising=False)
    # Keep the suite hermetic: never let app startup or resolve_openai_key() reload
    # the developer's real .env (which carries a live OPENAI key + Supabase backend)
    # back into the process. Tests that need a key mock resolve_openai_key directly.
    monkeypatch.setattr("assay_api.agent_research.load_local_env", lambda: None)
    monkeypatch.setattr("assay_api.main._load_local_env", lambda: None)
    # ...and also scrub a key that is ALREADY in os.environ (exported in the shell,
    # or leaked from a live run in this same process). Otherwise resolve_openai_key()
    # returns it and the CLI/adapters silently flip to live grading, making
    # deterministic mock-mode tests nondeterministic. `ASSAY_DISABLE_OPENAI` is reset
    # too because `cli.main` mutates it and it would otherwise leak between tests.
    for _var in ("OPENAI_API_KEY", "OPENAI_KEY", "openai_key", "ASSAY_DISABLE_OPENAI"):
        monkeypatch.delenv(_var, raising=False)
    if request.node.get_closest_marker("live") and _REAL_OPENAI_KEY:
        monkeypatch.setenv("OPENAI_API_KEY", _REAL_OPENAI_KEY)
    from assay_api.database import reset_store_cache
    from assay_api.routers.health import reset_health_cache
    from assay_api import rate_limit as rl

    reset_store_cache()
    reset_health_cache()
    rl.reset_rate_limit_state()
    yield
    reset_store_cache()
    reset_health_cache()
    rl.reset_rate_limit_state()


@pytest.fixture(autouse=True)
def scripted_model(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> None:
    """Stand in for the OpenAI model so exam tests run offline and deterministic.

    The product refuses to run an exam without a real model. Tests that are not
    about model access get a scripted stand-in (tests/scripted_model.py) for
    every ``openai-compatible`` candidate, and the model-availability check sees
    a placeholder key. HTTP candidates still use the real HTTP adapter.

    Opt out with ``@pytest.mark.no_model`` to test the real no-key behavior, or
    ``@pytest.mark.live`` to call the real OpenAI API.
    """
    if request.node.get_closest_marker("no_model") or request.node.get_closest_marker("live"):
        return
    from scripted_model import ScriptedModelAdapter

    from assay_api import orchestrator
    from assay_api.adapters import factory

    real_adapter_for = factory.adapter_for

    def adapter_for(config):
        if config.adapter_type == "openai-compatible":
            return ScriptedModelAdapter(config)
        return real_adapter_for(config)

    monkeypatch.setattr(orchestrator, "adapter_for", adapter_for)
    monkeypatch.setattr("assay_api.model_access.resolve_openai_key", lambda: "sk-scripted-test-model")


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """Skip ``live`` tests unless a real OpenAI key is in the environment."""
    if _REAL_OPENAI_KEY:
        return
    skip = pytest.mark.skip(reason="live test: set OPENAI_API_KEY to run against the real model")
    for item in items:
        if "live" in item.keywords:
            item.add_marker(skip)
