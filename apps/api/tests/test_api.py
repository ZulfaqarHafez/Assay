from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from assay_api.main import app


@pytest.fixture(autouse=True)
def _local_sqlite_only(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep API tests on the isolated sqlite store.

    The ``isolated_db`` conftest fixture clears Supabase env vars, but the app's
    startup hook calls ``load_local_env`` which would re-populate them from a
    developer's local ``.env`` and silently swap the backend to Supabase. Neutralize
    that load so persistence stays on the temp sqlite database for every test here.
    """
    monkeypatch.setattr("assay_api.main._load_local_env", lambda: None)


def test_demo_run_completes_with_scorecard(monkeypatch) -> None:
    class FakeAudit:
        def __init__(self, threshold: float):
            self.threshold = threshold

        def analyse(self, candidate, trace_steps, task_value_score):
            from assay_api.models import TraceAuditSummary

            return TraceAuditSummary(
                status="ok",
                trace_id="trace_test",
                tas_score=88,
                grade="Good",
                passes=True,
                total_steps=len(trace_steps),
                total_tokens=1000,
                raw={"debug": "large raw audit payload"},
            )

    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", FakeAudit)

    with TestClient(app) as client:
        candidates = client.get("/candidates").json()
        db_health = client.get("/health/database").json()
        candidate_id = candidates[0]["id"]
        run = client.post("/runs", json={"candidate_id": candidate_id}).json()
        pending_verdict_response = client.get(f"/runs/{run['id']}/verdict")
        scorecard = client.post(f"/runs/{run['id']}/start").json()
        events_response = client.get(f"/runs/{run['id']}/events")
        events = events_response.json()
        incremental_events_response = client.get(
            f"/runs/{run['id']}/events",
            params={"after": events[0]["sequence"]},
        )
        incremental_events = incremental_events_response.json()
        public_scorecard_response = client.get(f"/runs/{run['id']}/scorecard")
        public_scorecard = public_scorecard_response.json()
        verdict_response = client.get(f"/runs/{run['id']}/verdict")
        verdict = verdict_response.json()
        payoff_response = client.get(f"/runs/{run['id']}/payoff")
        payoff = payoff_response.json()
        surfaces_response = client.get(f"/runs/{run['id']}/surfaces")
        surfaces = surfaces_response.json()
        trace_response = client.get(f"/runs/{run['id']}/trace")
        trace = trace_response.json()
        bundle = client.get(f"/runs/{run['id']}/proof-bundle").json()
        detail_response = client.get(f"/runs/{run['id']}/detail")
        detail = detail_response.json()
        monkeypatch.setenv("ASSAY_API_KEYS", "secret-key-1")
        protected_verdict_response = client.get(
            f"/runs/{run['id']}/verdict",
            headers={"X-API-Key": "secret-key-1"},
        )
        protected_payoff_response = client.get(
            f"/runs/{run['id']}/payoff",
            headers={"X-API-Key": "secret-key-1"},
        )
        protected_surfaces_response = client.get(
            f"/runs/{run['id']}/surfaces",
            headers={"X-API-Key": "secret-key-1"},
        )
        protected_trace_response = client.get(
            f"/runs/{run['id']}/trace",
            headers={"X-API-Key": "secret-key-1"},
        )
        protected_detail_response = client.get(
            f"/runs/{run['id']}/detail",
            headers={"X-API-Key": "secret-key-1"},
        )

    assert scorecard["run_id"] == run["id"]
    assert db_health["backend"] == "sqlite"
    # A deterministic mock run answers identically every trial, so pass^k is
    # honestly flagged as non-stochastic rather than sold as resampling.
    assert scorecard["trials_stochastic"] is False
    assert scorecard["trace_audit"]["tas_score"] == 88
    assert events
    assert incremental_events
    assert len(incremental_events) < len(events)
    assert all(event["sequence"] > events[0]["sequence"] for event in incremental_events)
    assert public_scorecard["trace_audit"]["raw"] == {}
    assert pending_verdict_response.headers["cache-control"] == "no-store"
    assert events_response.headers["cache-control"] == "public, max-age=30, stale-while-revalidate=300"
    assert incremental_events_response.headers["cache-control"] == "public, max-age=30, stale-while-revalidate=300"
    assert public_scorecard_response.headers["cache-control"] == "public, max-age=30, stale-while-revalidate=300"
    assert verdict_response.headers["cache-control"] == "public, max-age=30, stale-while-revalidate=300"
    assert protected_verdict_response.headers["cache-control"] == "no-store"
    assert payoff_response.headers["cache-control"] == "public, max-age=30, stale-while-revalidate=300"
    assert protected_payoff_response.headers["cache-control"] == "no-store"
    assert surfaces_response.headers["cache-control"] == "public, max-age=30, stale-while-revalidate=300"
    assert protected_surfaces_response.headers["cache-control"] == "no-store"
    assert trace_response.headers["cache-control"] == "public, max-age=30, stale-while-revalidate=300"
    assert detail_response.headers["cache-control"] == "public, max-age=30, stale-while-revalidate=300"
    assert protected_trace_response.headers["cache-control"] == "no-store"
    assert protected_detail_response.headers["cache-control"] == "no-store"
    assert "origin" in verdict_response.headers["vary"].lower()
    assert "origin" in surfaces_response.headers["vary"].lower()
    assert verdict["schema"] == "assay.run_verdict.v1"
    assert verdict["run"]["id"] == run["id"]
    assert verdict["candidate"]["id"] == candidate_id
    assert verdict["candidate"]["name"]
    assert verdict["scorecard"]["trace_audit"]["raw"] == {}
    assert verdict["deployability"]["schema"] == "assay.deployability_decision.v1"
    assert verdict["comparison"] is None
    assert "events" not in verdict
    assert "product_review" not in verdict
    assert payoff["schema"] == "assay.run_payoff.v1"
    assert payoff["run_id"] == run["id"]
    assert payoff["agent_spec"]["schema"] == "assay.agent_spec.v1"
    assert payoff["deployability"]["schema"] == "assay.deployability_decision.v1"
    assert "events" not in payoff
    assert "scorecard" not in payoff
    assert "product_review" not in payoff
    assert surfaces["schema"] == "assay.run_surfaces.v1"
    assert surfaces["run_id"] == run["id"]
    assert surfaces["agent_spec"]["schema"] == "assay.agent_spec.v1"
    assert surfaces["product_review"]["schema"] == "assay.product_review.v1"
    assert surfaces["candidate_progress"]["schema"] == "assay.candidate_progress.v1"
    assert isinstance(surfaces["diagnostic_library"], list)
    assert "scorecard" not in surfaces
    assert "events" not in surfaces
    assert trace["scorecard"]["run_id"] == run["id"]
    assert trace["scorecard"]["trace_audit"]["raw"] == {}
    assert bundle["schema"] == "assay.proof_bundle.v1"
    assert bundle["summary"]["event_count"] == len(events)
    assert bundle["database"]["backend"] == "sqlite"
    assert "connectors" not in bundle
    assert "connector_probes" not in bundle
    assert bundle["product_review"]["schema"] == "assay.product_review.v1"
    assert bundle["deployability"]["schema"] == "assay.deployability_decision.v1"
    assert bundle["summary"]["deployability_label"] in {"Ship", "Probation", "Do not ship", "Unverified"}
    assert detail["schema"] == "assay.proof_bundle.v1"
    assert detail["detail_profile"] == "fast"
    assert detail["events"] == []
    assert detail["summary"]["event_count"] == 0
    assert detail["scorecard"]["trace_audit"]["raw"] == {}
    assert bundle["scorecard"]["trace_audit"]["raw"] == {"debug": "large raw audit payload"}
    assert detail["product_review"]["schema"] == "assay.product_review.v1"
    assert detail["agent_spec"]["schema"] == "assay.agent_spec.v1"
    assert detail["candidate_progress"]["schema"] == "assay.candidate_progress.v1"
    assert isinstance(detail["diagnostic_library"], list)
    assert "database" not in detail
    assert "connectors" not in detail
    assert "connector_probes" not in detail
    assert "role_analysis" not in detail


def test_workspace_summary_endpoints_omit_heavy_payloads(monkeypatch) -> None:
    class FakeAudit:
        def __init__(self, threshold: float):
            self.threshold = threshold

        def analyse(self, candidate, trace_steps, task_value_score):
            from assay_api.models import TraceAuditSummary

            return TraceAuditSummary(
                status="ok",
                trace_id="trace_test",
                tas_score=88,
                grade="Good",
                passes=True,
                total_steps=len(trace_steps),
                total_tokens=1000,
                raw={"debug": "large raw audit payload"},
            )

    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", FakeAudit)

    with TestClient(app) as client:
        candidate = client.post(
            "/candidates",
            json={
                "name": "Verbose Agent",
                "adapter_type": "mock",
                "system_prompt": "# Verbose\n\n" + ("instructions " * 200),
                "metadata": {"source": "test", "notes": "large metadata should stay off summary"},
            },
        ).json()
        run = client.post(
            "/runs",
            json={
                "candidate_id": candidate["id"],
                "job_scope": {
                    "raw_text": "Screen candidates fairly",
                    "title": "Recruiting Screener",
                },
            },
        ).json()
        client.post(f"/runs/{run['id']}/start")
        candidate_summary_response = client.get("/candidates/summary")
        run_summary_response = client.get("/runs/summary")
        boot_response = client.get("/workspace/boot?profile=summary")
        candidate_summary = candidate_summary_response.json()[0]
        run_summary = run_summary_response.json()[0]
        exam_pack_summary = boot_response.json()["exam_pack_summaries"][0]

    assert candidate_summary["id"] == candidate["id"]
    assert candidate_summary["name"] == "Verbose Agent"
    assert candidate_summary["adapter_type"] == "mock"
    assert "system_prompt" not in candidate_summary
    assert "metadata" not in candidate_summary
    assert candidate_summary_response.headers["cache-control"] == "public, max-age=30, stale-while-revalidate=300"
    assert "origin" in candidate_summary_response.headers["vary"].lower()

    assert run_summary["id"] == run["id"]
    assert run_summary["candidate_id"] == candidate["id"]
    assert run_summary["candidate_name"] == "Verbose Agent"
    assert run_summary["candidate_adapter_type"] == "mock"
    assert run_summary["certified"] in {True, False}
    assert run_summary["pass_count"] >= 0
    assert "job_scope" not in run_summary
    assert "system_prompt" not in run_summary
    assert "metadata" not in run_summary
    assert "tailored_exam_pack" not in run_summary
    assert run_summary_response.headers["cache-control"] == "public, max-age=30, stale-while-revalidate=300"
    assert "origin" in run_summary_response.headers["vary"].lower()

    assert exam_pack_summary["id"]
    assert exam_pack_summary["item_count"] >= 1
    assert exam_pack_summary["competencies"]
    assert "items" not in exam_pack_summary
    assert boot_response.headers["cache-control"] == "public, max-age=30, stale-while-revalidate=300"
    assert "origin" in boot_response.headers["vary"].lower()


def test_run_summary_keeps_same_named_candidates_separate() -> None:
    with TestClient(app) as client:
        first = client.post(
            "/candidates",
            json={
                "name": "Twin Agent",
                "adapter_type": "mock",
                "system_prompt": "# Twin Agent\n\nFirst implementation.",
            },
        ).json()
        second = client.post(
            "/candidates",
            json={
                "name": "Twin Agent",
                "adapter_type": "mock",
                "system_prompt": "# Twin Agent\n\nSecond implementation.",
            },
        ).json()
        first_run = client.post("/runs", json={"candidate_id": first["id"]}).json()
        second_run = client.post("/runs", json={"candidate_id": second["id"]}).json()
        summaries = client.get("/runs/summary").json()

    twins = [row for row in summaries if row["candidate_name"] == "Twin Agent"]
    assert {row["candidate_id"] for row in twins} == {first["id"], second["id"]}
    assert {row["id"] for row in twins} == {first_run["id"], second_run["id"]}


def test_workspace_boot_batches_slim_first_paint_payload(monkeypatch) -> None:
    monkeypatch.setattr("assay_api.routers.health.resolve_openai_key", lambda: "test-key")

    with TestClient(app) as client:
        candidate = client.post(
            "/candidates",
            json={
                "name": "Boot Agent",
                "adapter_type": "mock",
                "system_prompt": "# Boot Agent\n\n" + ("instructions " * 200),
                "metadata": {"source": "test", "notes": "large metadata should stay off boot"},
            },
        ).json()
        full_response = client.get("/workspace/boot")
        response = client.get("/workspace/boot?profile=summary")
        full_payload = full_response.json()
        payload = response.json()

    assert payload["schema"] == "assay.workspace_boot.v1"
    assert payload["health"]["ok"] is True
    assert payload["health"]["openai_configured"] is True
    assert full_payload["exam_packs"][0]["items"]
    assert "exam_pack_summaries" not in full_payload
    assert payload["exam_pack_summaries"]
    assert "items" not in payload["exam_pack_summaries"][0]
    assert payload["exam_pack_summaries"][0]["item_count"] >= 1
    assert payload["exam_pack_summaries"][0]["competencies"]
    assert "exam_packs" not in payload
    assert payload["candidate_summaries"][0]["id"] == candidate["id"]
    assert payload["candidate_summaries"][0]["name"] == "Boot Agent"
    assert "system_prompt" not in payload["candidate_summaries"][0]
    assert "metadata" not in payload["candidate_summaries"][0]
    assert "candidates" not in payload
    assert response.headers["cache-control"] == "public, max-age=30, stale-while-revalidate=300"
    assert "origin" in response.headers["vary"].lower()


def test_workspace_boot_bounds_recent_candidate_summaries() -> None:
    with TestClient(app) as client:
        for index in range(5):
            client.post(
                "/candidates",
                json={
                    "name": f"Boot Agent {index}",
                    "adapter_type": "mock",
                    "system_prompt": f"# Boot Agent {index}",
                },
            )
        boot = client.get("/workspace/boot?profile=summary&candidate_limit=2").json()
        all_summaries = client.get("/candidates/summary").json()

    assert [item["name"] for item in boot["candidate_summaries"]] == [
        "Boot Agent 4",
        "Boot Agent 3",
    ]
    assert sum(1 for item in all_summaries if item["name"].startswith("Boot Agent ")) == 5


def test_health_payload_caches_readiness_probes(monkeypatch) -> None:
    from assay_api.routers import health as health_router

    calls = {"tracerazor": 0, "openai": 0}
    health_router.reset_health_cache()
    monkeypatch.setattr(
        health_router,
        "_load_tracerazor_client",
        lambda: calls.__setitem__("tracerazor", calls["tracerazor"] + 1) or object(),
    )
    monkeypatch.setattr(
        health_router,
        "resolve_openai_key",
        lambda: calls.__setitem__("openai", calls["openai"] + 1) or "test-key",
    )

    first = health_router.health_payload()
    second = health_router.health_payload()

    assert first["tracerazor_importable"] is True
    assert first["openai_configured"] is True
    assert second["tracerazor_importable"] is True
    assert second["openai_configured"] is True
    assert calls == {"tracerazor": 1, "openai": 1}


def test_supabase_startup_skips_eager_db_probe(monkeypatch) -> None:
    """Production Supabase cold starts should not probe or seed the DB eagerly."""
    from assay_api import main

    called: list[str] = []
    monkeypatch.setenv("ASSAY_DB_BACKEND", "supabase")
    monkeypatch.setattr(main, "_load_local_env", lambda: called.append("load_env"))
    monkeypatch.setattr(main, "_check_production_hardening", lambda: called.append("hardening"))
    monkeypatch.setattr(main, "init_db", lambda: called.append("init_db"))
    monkeypatch.setattr(main, "list_candidates", lambda: called.append("list_candidates") or [])
    monkeypatch.setattr(main, "save_candidate", lambda candidate: called.append("save_candidate"))

    main.startup()

    assert called == ["load_env", "hardening"]


def test_agent_spec_endpoint_and_export(monkeypatch) -> None:
    class FakeAudit:
        def __init__(self, threshold: float):
            self.threshold = threshold

        def analyse(self, candidate, trace_steps, task_value_score):
            from assay_api.models import TraceAuditSummary

            return TraceAuditSummary(
                status="ok",
                trace_id="trace_test",
                tas_score=88,
                grade="Good",
                passes=True,
                total_steps=len(trace_steps),
                total_tokens=1000,
            )

    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", FakeAudit)

    with TestClient(app) as client:
        candidate_id = client.get("/candidates").json()[0]["id"]
        run = client.post("/runs", json={"candidate_id": candidate_id}).json()
        client.post(f"/runs/{run['id']}/start")
        spec_response = client.get(f"/runs/{run['id']}/agent-spec")
        spec = spec_response.json()
        bundle = client.get(f"/runs/{run['id']}/proof-bundle").json()

    assert spec["schema"] == "assay.agent_spec.v1"
    assert spec["run_id"] == run["id"]
    assert spec_response.headers["cache-control"] == "public, max-age=30, stale-while-revalidate=300"
    assert spec["readiness"] in {"ready", "refine", "needs_subagents"}
    assert spec["agent_markdown"].startswith("# Demo Candidate")
    assert isinstance(spec["sub_agents"], list)
    assert spec["metrics"]["tas_score"] == 88

    assert bundle["agent_spec"]["schema"] == "assay.agent_spec.v1"
    assert bundle["agent_spec"]["run_id"] == run["id"]


def test_agent_spec_recommends_subagents_for_failing_run(monkeypatch) -> None:
    class FakeAudit:
        def __init__(self, threshold: float):
            self.threshold = threshold

        def analyse(self, candidate, trace_steps, task_value_score):
            from assay_api.models import TraceAuditSummary

            return TraceAuditSummary(
                status="ok", trace_id="t", tas_score=88, grade="Good", passes=True,
                total_steps=len(trace_steps), total_tokens=1000,
            )

    def failing_grade(item, response, threshold, **_kwargs):
        from assay_api.scoring import GradeResult

        return GradeResult(
            score=0.2,
            passed=False,
            panel_scores={"rubric": 0.2, "compliance": 0.2, "consistency": 0.2},
            matched_checks=[],
            missed_checks=[check.id for check in item.expected_checks],
            forbidden_hits=[],
            feedback="needs work",
        )

    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", FakeAudit)
    monkeypatch.setattr("assay_api.orchestrator.grade_response", failing_grade)

    with TestClient(app) as client:
        candidate_id = client.get("/candidates").json()[0]["id"]
        # Pin the plain HR pack: this exercises the grade_response path the test
        # monkeypatches, not the guardrail scenario grader (now the default pack).
        run = client.post(
            "/runs", json={"candidate_id": candidate_id, "exam_pack_id": "hr-v1"}
        ).json()
        client.post(f"/runs/{run['id']}/start")
        spec = client.get(f"/runs/{run['id']}/agent-spec").json()

    assert spec["readiness"] == "needs_subagents"
    assert spec["metrics"]["recommended_subagents"] >= 1
    assert any(sub["priority"] == "recommended" for sub in spec["sub_agents"])


def test_agent_spec_requires_started_run(monkeypatch) -> None:
    with TestClient(app) as client:
        candidate_id = client.get("/candidates").json()[0]["id"]
        run = client.post("/runs", json={"candidate_id": candidate_id}).json()
        response = client.get(f"/runs/{run['id']}/agent-spec")
        missing = client.get("/runs/run_does_not_exist/agent-spec")

    assert response.status_code == 409
    assert missing.status_code == 404


class _RoleFakeAudit:
    def __init__(self, threshold: float):
        self.threshold = threshold

    def analyse(self, candidate, trace_steps, task_value_score):
        from assay_api.models import TraceAuditSummary

        return TraceAuditSummary(
            status="ok", trace_id="t", tas_score=88, grade="Good", passes=True,
            total_steps=len(trace_steps), total_tokens=1000,
        )


def test_retired_workspace_routes_are_not_mounted() -> None:
    with TestClient(app) as client:
        run = client.post(
            "/runs",
            json={"candidate_id": client.get("/candidates").json()[0]["id"]},
        ).json()
        retired = [
            ("GET", "/agents/summary"),
            ("GET", f"/agents/{run['candidate_id']}/home"),
            ("GET", "/suites"),
            ("GET", "/exam-packs"),
            ("GET", "/exam-packs/summary"),
            ("POST", "/exam-packs/import"),
            ("POST", "/exam-packs/import-file"),
            ("GET", "/connectors"),
            ("GET", "/connectors/probe"),
            ("POST", "/role-analysis"),
            ("GET", f"/runs/{run['id']}/role-analysis"),
            ("GET", f"/runs/{run['id']}/role-brief"),
            ("GET", f"/runs/{run['id']}/reviewers"),
            ("POST", f"/runs/{run['id']}/agent-spec/export-files"),
            ("POST", f"/runs/{run['id']}/agent-spec/research"),
        ]
        statuses = [
            client.request(method, path, json={"raw_text": "screen candidates"}).status_code
            for method, path in retired
        ]

    assert statuses == [404] * len(statuses)


def test_run_round_trips_job_scope_and_proof_bundle(monkeypatch) -> None:
    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", _RoleFakeAudit)

    job_scope = {
        "raw_text": "Screen and rank candidates and parse each resume upload; protect ssn and gdpr data.",
        "title": "Recruiting Screener",
        "seniority": "senior",
        "domain": "talent acquisition",
    }

    with TestClient(app) as client:
        candidate_id = client.get("/candidates").json()[0]["id"]
        run = client.post(
            "/runs",
            json={"candidate_id": candidate_id, "job_scope": job_scope},
        ).json()
        fetched = client.get(f"/runs/{run['id']}").json()
        client.post(f"/runs/{run['id']}/start")
        bundle = client.get(f"/runs/{run['id']}/proof-bundle").json()
        events = client.get(f"/runs/{run['id']}/events").json()

    # The job scope round-trips through the persisted run payload.
    assert fetched["job_scope"] is not None
    assert fetched["job_scope"]["title"] == "Recruiting Screener"
    assert fetched["job_scope"]["raw_text"].startswith("Screen and rank")

    # Role analysis remains available in the proof bundle without a standalone route.
    assert bundle["role_analysis"]["schema"] == "assay.role_analysis.v1"

    # The role scope is applied as a deterministic orchestration event.
    assert any(event["event_type"] == "role_scope_applied" for event in events)


def test_coding_agent_pack_lists_exports_and_runs(monkeypatch) -> None:
    """The non-HR coding-agent pack remains available to the run engine."""

    from assay_api.exam_packs import get_exam_pack, list_exam_packs

    class FakeAudit:
        def __init__(self, threshold: float):
            self.threshold = threshold

        def analyse(self, candidate, trace_steps, task_value_score):
            from assay_api.models import TraceAuditSummary

            return TraceAuditSummary(
                status="ok",
                trace_id="trace_test",
                tas_score=88,
                grade="Good",
                passes=True,
                total_steps=len(trace_steps),
                total_tokens=1000,
            )

    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", FakeAudit)

    packs = list_exam_packs()
    pack = get_exam_pack("coding-agent-v1")

    with TestClient(app) as client:
        candidate_id = client.get("/candidates").json()[0]["id"]
        run = client.post(
            "/runs",
            json={"candidate_id": candidate_id, "exam_pack_id": "coding-agent-v1"},
        ).json()
        scorecard = client.post(f"/runs/{run['id']}/start").json()

    assert any(item.id == "coding-agent-v1" for item in packs)
    assert len(pack.items) == 4
    assert run["exam_pack_id"] == "coding-agent-v1"
    assert scorecard["run_id"] == run["id"]
    # The pack's own competencies are graded, not the HR floor competencies.
    assert "destructive_action_safety" in scorecard["pass_at_k"]
    assert "secret_handling" in scorecard["pass_at_k"]


def test_run_badge_svg(monkeypatch) -> None:
    class FakeAudit:
        def __init__(self, threshold: float):
            self.threshold = threshold

        def analyse(self, candidate, trace_steps, task_value_score):
            from assay_api.models import TraceAuditSummary

            return TraceAuditSummary(
                status="ok", trace_id="t", tas_score=88, grade="Good", passes=True,
                total_steps=len(trace_steps), total_tokens=1000,
            )

    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", FakeAudit)

    with TestClient(app) as client:
        candidate_id = client.get("/candidates").json()[0]["id"]
        run = client.post("/runs", json={"candidate_id": candidate_id}).json()
        client.post(f"/runs/{run['id']}/start")
        badge = client.get(f"/runs/{run['id']}/badge.svg")
        pending = client.get("/runs/run_missing/badge.svg")

    assert badge.status_code == 200
    assert badge.headers["content-type"].startswith("image/svg+xml")
    assert "<svg" in badge.text and "assay" in badge.text
    # A deterministic mock run is honestly a demo badge, and lands on a real band.
    assert any(word in badge.text for word in ("ship", "risky", "hold", "unverified"))
    # An unknown run still returns a valid (neutral) badge, never a broken image.
    assert pending.status_code == 200
    assert "pending" in pending.text


def test_run_verdict_card_svg(monkeypatch) -> None:
    class FakeAudit:
        def __init__(self, threshold: float):
            self.threshold = threshold

        def analyse(self, candidate, trace_steps, task_value_score):
            from assay_api.models import TraceAuditSummary

            return TraceAuditSummary(
                status="ok", trace_id="t", tas_score=88, grade="Good", passes=True,
                total_steps=len(trace_steps), total_tokens=1000,
            )

    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", FakeAudit)

    with TestClient(app) as client:
        candidate_id = client.get("/candidates").json()[0]["id"]
        run = client.post("/runs", json={"candidate_id": candidate_id}).json()
        client.post(f"/runs/{run['id']}/start")
        card = client.get(f"/runs/{run['id']}/card.svg")
        pending = client.get("/runs/run_missing/card.svg")

    assert card.status_code == 200
    assert card.headers["content-type"].startswith("image/svg+xml")
    assert card.text.startswith("<svg") and "ASSAY" in card.text
    # Renders one of the three canonical bands and the pass^k readout.
    assert any(word in card.text for word in ("SHIP", "RISKY", "HOLD", "UNVERIFIED"))
    assert "PASS^K" in card.text
    # Unknown run still returns a valid (pending) card, never a broken image.
    assert pending.status_code == 200
    assert "PENDING" in pending.text


def test_verdict_card_is_public(monkeypatch) -> None:
    """The card is embedded as an <img>, so it must be reachable without a key."""
    monkeypatch.setenv("ASSAY_API_KEYS", "secret-key-1")
    with TestClient(app) as client:
        card = client.get("/runs/run_any/card.svg")
        scorecard = client.get("/runs/run_any/scorecard")
    assert card.status_code == 200
    assert scorecard.status_code == 401


def test_agent_spec_diff_endpoint(monkeypatch) -> None:
    class FakeAudit:
        def __init__(self, threshold: float):
            self.threshold = threshold

        def analyse(self, candidate, trace_steps, task_value_score):
            from assay_api.models import TraceAuditSummary

            return TraceAuditSummary(
                status="ok",
                trace_id="trace_test",
                tas_score=88,
                grade="Good",
                passes=True,
                total_steps=len(trace_steps),
                total_tokens=1000,
            )

    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", FakeAudit)
    # Force offline registration so the uploaded candidate runs on the mock
    # adapter even when the developer's .env carries a live OpenAI key.
    monkeypatch.setattr("assay_api.routers.candidates.resolve_openai_key", lambda: None)

    original_md = "# Diffable Agent\n\nAnswer support questions using company policy.\n"
    with TestClient(app) as client:
        uploaded = client.post(
            "/candidates/from-markdown",
            json={"markdown": original_md, "name": "Diffable Agent"},
        ).json()
        run = client.post("/runs", json={"candidate_id": uploaded["candidate"]["id"]}).json()

        pending = client.get(f"/runs/{run['id']}/agent-spec/diff")
        client.post(f"/runs/{run['id']}/start")
        diff_response = client.get(f"/runs/{run['id']}/agent-spec/diff")
        diff = diff_response.json()
        spec = client.get(f"/runs/{run['id']}/agent-spec").json()

        # The seeded demo candidate has no stored original definition.
        all_candidates = client.get("/candidates").json()
        demo_id = next(c["id"] for c in all_candidates if c["name"] == "Demo Candidate")
        demo_run = client.post("/runs", json={"candidate_id": demo_id}).json()
        client.post(f"/runs/{demo_run['id']}/start")
        demo_diff = client.get(f"/runs/{demo_run['id']}/agent-spec/diff").json()

        missing = client.get("/runs/run_missing/agent-spec/diff")

    assert pending.status_code == 409
    assert diff["schema"] == "assay.agent_diff.v1"
    assert diff_response.headers["cache-control"] == "public, max-age=30, stale-while-revalidate=300"
    assert diff["original_available"] is True
    assert diff["hunks"]
    assert diff["added"] > 0
    assert any(line["op"] == "-" for hunk in diff["hunks"] for line in hunk["lines"])
    assert "--- original/agent.md" in diff["unified"]
    assert spec["original_markdown"] == original_md
    assert demo_diff["original_available"] is False
    assert demo_diff["added"] > 0
    assert missing.status_code == 404


def test_deployability_endpoint_reflects_run_policy(monkeypatch) -> None:
    class FakeAudit:
        def __init__(self, threshold: float):
            self.threshold = threshold

        def analyse(self, candidate, trace_steps, task_value_score):
            from assay_api.models import TraceAuditSummary

            return TraceAuditSummary(
                status="ok",
                trace_id="trace_test",
                tas_score=88,
                grade="Good",
                passes=True,
                total_steps=len(trace_steps),
                total_tokens=1000,
            )

    monkeypatch.setattr("assay_api.orchestrator.TraceAuditService", FakeAudit)

    with TestClient(app) as client:
        candidate_id = client.get("/candidates").json()[0]["id"]
        run = client.post(
            "/runs",
            json={
                "candidate_id": candidate_id,
                "policy_name": "advisory",
                "competency_threshold": 0.7,
            },
        ).json()

        pending = client.get(f"/runs/{run['id']}/deployability")
        client.post(f"/runs/{run['id']}/start")
        decision = client.get(f"/runs/{run['id']}/deployability").json()
        strict_view = client.get(f"/runs/{run['id']}/deployability", params={"policy": "strict"}).json()
        bad_policy = client.get(f"/runs/{run['id']}/deployability", params={"policy": "bogus"})
        missing = client.get("/runs/run_missing/deployability")

    assert run["policy_name"] == "advisory"
    assert pending.status_code == 409
    assert decision["schema"] == "assay.deployability_decision.v1"
    assert decision["policy"]["name"] == "advisory"
    assert decision["policy"]["competency_threshold"] == 0.7
    assert decision["policy"]["require_trace"] is False
    assert decision["verdict"] in {"ship", "probation", "do_not_ship", "unverified"}
    assert strict_view["policy"]["name"] == "strict"
    assert strict_view["policy"]["require_trace"] is True
    # Run thresholds still overlay the what-if named policy.
    assert strict_view["policy"]["competency_threshold"] == 0.7
    assert bad_policy.status_code == 422
    assert missing.status_code == 404
