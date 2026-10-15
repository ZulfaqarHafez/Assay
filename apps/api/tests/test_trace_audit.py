from __future__ import annotations

import time

import assay_api.trace_audit as trace_audit
from assay_api.models import CandidateConfig
from assay_api.trace_audit import (
    TraceAuditService,
    _audit_slice,
    _ensure_tracerazor_bin,
    tracerazor_doctor,
)


def test_trace_audit_reports_insufficient_steps() -> None:
    service = TraceAuditService(threshold=70)
    candidate = CandidateConfig(name="Demo", adapter_type="openai-compatible")

    summary = service.analyse(candidate, trace_steps=[{"id": 1}], task_value_score=1.0)

    assert summary.status == "insufficient_steps"
    assert summary.total_steps == 1
    assert not summary.passes


def test_trace_audit_accepts_fake_client(monkeypatch) -> None:
    class FakeReport:
        trace_id = "trace_fake"
        tas_score = 91.0
        grade = "Excellent"
        passes = True
        total_steps = 5
        total_tokens = 500
        metrics = {"score": 91}
        savings = {"tokens_saved": 12}
        fixes = []
        raw = {"ok": True}

    class FakeClient:
        def __init__(self, threshold: float):
            self.threshold = threshold

        def analyse(self, trace):
            assert len(trace["steps"]) == 5
            assert trace["task_value_score"] == 0.9
            return FakeReport()

    monkeypatch.setattr("assay_api.trace_audit._load_tracerazor_client", lambda: FakeClient)

    service = TraceAuditService(threshold=70)
    candidate = CandidateConfig(name="Demo", adapter_type="openai-compatible")
    steps = [{"id": index + 1, "type": "reasoning", "content": "x", "tokens": 1} for index in range(5)]

    summary = service.analyse(candidate, trace_steps=steps, task_value_score=0.9)

    assert summary.status == "ok"
    assert summary.tas_score == 91.0
    assert summary.savings["tokens_saved"] == 12


def test_trace_audit_caps_large_repeated_traces(monkeypatch) -> None:
    class FakeReport:
        trace_id = "trace_sampled"
        tas_score = 84.0
        grade = "Good"
        passes = True
        total_steps = 8
        total_tokens = 800
        metrics = {"score": 84}
        savings = {}
        fixes = []
        raw = {"ok": True}

    class FakeClient:
        def __init__(self, threshold: float):
            self.threshold = threshold

        def analyse(self, trace):
            assert len(trace["steps"]) == 8
            assert trace["metadata"]["source_steps"] == 60
            assert trace["metadata"]["audited_steps"] == 8
            assert trace["metadata"]["sampling"] == "representative"
            return FakeReport()

    monkeypatch.setattr("assay_api.trace_audit._load_tracerazor_client", lambda: FakeClient)

    service = TraceAuditService(threshold=70)
    candidate = CandidateConfig(name="Demo", adapter_type="openai-compatible")
    steps = [
        {
            "id": index + 1,
            "type": "reasoning" if index % 2 == 0 else "tool_call",
            "content": f"step {index}",
            "tokens": 40,
            "metadata": {
                "competency": f"comp_{index % 5}",
                "variant": "seen" if index % 2 == 0 else "held_out",
            },
        }
        for index in range(60)
    ]

    summary = service.analyse(candidate, trace_steps=steps, task_value_score=1.0)

    assert summary.status == "ok"
    assert summary.total_steps == 60
    assert summary.raw["assay_audit"]["audited_steps"] == 8


def test_audit_slice_keeps_short_traces_unchanged() -> None:
    steps = [{"id": index} for index in range(7)]

    assert _audit_slice(steps, 24) == steps


def test_trace_audit_times_out_slow_real_client(monkeypatch) -> None:
    class SlowClient:
        def __init__(self, threshold: float):
            self.threshold = threshold

        def analyse(self, trace):
            time.sleep(5)

    SlowClient.__module__ = "tracerazor._audit_client"
    monkeypatch.setattr("assay_api.trace_audit._load_tracerazor_client", lambda: SlowClient)
    monkeypatch.setenv("ASSAY_TRACERAZOR_TIMEOUT_S", "0.2")

    service = TraceAuditService(threshold=70)
    candidate = CandidateConfig(name="Demo", adapter_type="openai-compatible")
    steps = [{"id": index + 1, "type": "reasoning", "content": "x", "tokens": 1} for index in range(5)]

    summary = service.analyse(candidate, trace_steps=steps, task_value_score=0.9)

    assert summary.status == "error"
    assert "timed out" in (summary.message or "")


def test_trace_audit_passes_timeout_to_real_client(monkeypatch) -> None:
    seen: dict[str, float] = {}

    class FakeReport:
        trace_id = "trace_bounded"
        tas_score = 88.0
        grade = "Good"
        passes = True
        total_steps = 5
        total_tokens = 500
        metrics = {}
        savings = {}
        fixes = []
        raw = {}

    class BoundedClient:
        def __init__(self, threshold: float, timeout: float):
            seen["timeout"] = timeout

        def analyse(self, trace):
            return FakeReport()

    BoundedClient.__module__ = "tracerazor._audit_client"
    monkeypatch.setattr("assay_api.trace_audit._load_tracerazor_client", lambda: BoundedClient)
    monkeypatch.setenv("ASSAY_TRACERAZOR_TIMEOUT_S", "7")

    service = TraceAuditService(threshold=70)
    candidate = CandidateConfig(name="Demo", adapter_type="openai-compatible")
    steps = [{"id": index + 1, "type": "reasoning", "content": "x", "tokens": 1} for index in range(5)]

    summary = service.analyse(candidate, trace_steps=steps, task_value_score=0.9)

    assert summary.status == "ok"
    assert seen["timeout"] == 7.0


def test_ensure_tracerazor_bin_sets_env_from_local_build(monkeypatch, tmp_path) -> None:
    release = tmp_path / "target" / "release"
    release.mkdir(parents=True)
    exe = release / "tracerazor.exe"
    exe.write_bytes(b"stub")

    monkeypatch.delenv("TRACERAZOR_BIN", raising=False)
    monkeypatch.setattr(trace_audit, "LOCAL_TRACERAZOR", str(tmp_path))

    _ensure_tracerazor_bin()

    import os

    assert os.environ.get("TRACERAZOR_BIN") == str(exe)
    monkeypatch.delenv("TRACERAZOR_BIN", raising=False)


def test_ensure_tracerazor_bin_respects_existing_env(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRACERAZOR_BIN", "preset")
    monkeypatch.setattr(trace_audit, "LOCAL_TRACERAZOR", str(tmp_path))

    _ensure_tracerazor_bin()

    import os

    assert os.environ.get("TRACERAZOR_BIN") == "preset"


def test_ensure_tracerazor_bin_noop_without_local_build(monkeypatch, tmp_path) -> None:
    monkeypatch.delenv("TRACERAZOR_BIN", raising=False)
    monkeypatch.setattr(trace_audit, "LOCAL_TRACERAZOR", str(tmp_path / "missing"))

    _ensure_tracerazor_bin()

    import os

    assert os.environ.get("TRACERAZOR_BIN") is None


def test_tracerazor_doctor_runs_synthetic_smoke(monkeypatch) -> None:
    class FakeReport:
        trace_id = "trace_doctor"
        tas_score = 93.0
        grade = "Excellent"
        passes = True
        total_steps = 5
        total_tokens = 500
        metrics = {}
        savings = {}
        fixes = []
        raw = {}

    class FakeClient:
        def __init__(self, threshold: float):
            self.threshold = threshold

        def analyse(self, trace):
            assert len(trace["steps"]) == 5
            return FakeReport()

    monkeypatch.setattr("assay_api.trace_audit._load_tracerazor_client", lambda: FakeClient)

    payload = tracerazor_doctor()

    assert payload["schema"] == "assay.tracerazor_doctor.v1"
    assert payload["installed"] is True
    assert payload["status"] == "passed"
    assert payload["summary"]["tas_score"] == 93.0


def test_make_client_passes_the_timeout_under_each_client_signature() -> None:
    from assay_api.trace_audit import _make_client

    class Current:  # tracerazor >= 1.1
        def __init__(self, threshold: float, timeout_s: float = 60.0):
            self.timeout = timeout_s

    class Legacy:  # tracerazor 1.0.4
        def __init__(self, threshold: float, timeout: float = 60.0):
            self.timeout = timeout

    class Unbounded:  # older clients
        def __init__(self, threshold: float):
            self.timeout = None

    current, current_bounded = _make_client(Current, 70, 12.5)
    legacy, legacy_bounded = _make_client(Legacy, 70, 12.5)
    unbounded, unbounded_bounded = _make_client(Unbounded, 70, 12.5)

    assert (current.timeout, current_bounded) == (12.5, True)
    assert (legacy.timeout, legacy_bounded) == (12.5, True)
    assert (unbounded.timeout, unbounded_bounded) == (None, False)


def test_installed_tracerazor_client_receives_the_timeout() -> None:
    import pytest

    tracerazor = pytest.importorskip("tracerazor")
    from assay_api.trace_audit import _make_client

    client, bounded = _make_client(tracerazor.TraceRazorClient, 70, 9.0)
    assert bounded is True
    assert getattr(client, "_timeout_s", 9.0) == 9.0


def test_local_checkout_path_has_no_hardcoded_personal_default(monkeypatch) -> None:
    from assay_api import trace_audit

    monkeypatch.setenv("TRACERAZOR_REPO", "/opt/tracerazor")
    assert trace_audit._local_tracerazor_checkout() == "/opt/tracerazor"
    monkeypatch.delenv("TRACERAZOR_REPO")
    assert "zulfa" not in trace_audit._local_tracerazor_checkout()
