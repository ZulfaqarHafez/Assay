from __future__ import annotations

import os
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def isolated_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSAY_DB_PATH", str(tmp_path / "assay-test.db"))
    monkeypatch.delenv("ASSAY_DB_BACKEND", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.delenv("ASSAY_REQUIRE_TENANT", raising=False)
    monkeypatch.delenv("ASSAY_DEFAULT_TENANT", raising=False)
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
