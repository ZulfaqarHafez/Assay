from __future__ import annotations

import os
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, Response

from ..agent_diff import diff_payload
from ..badge import agent_hash, badge_svg
from ..cache_headers import public_read_json_headers
from ..agent_refinery import agent_spec_payload
from ..database import (
    database_backend_name,
    database_health,
    get_candidate,
    get_lessons,
    get_run,
    get_scorecard,
    get_scorecards,
    list_candidate_summaries,
    list_events,
    list_run_summaries,
    list_runs,
    proof_bundle,
    save_run,
)
from ..deployability import evaluate_scorecard, policy_for_run
from ..exam_packs import get_exam_pack, list_exam_pack_summaries, list_exam_packs
from ..models import RunCreate, RunRecord
from ..product_review import product_review_for_run
from ..progress import candidate_progress, lesson_library, run_comparison
from ..rate_limit import rate_limit
from ..role_intelligence import analyze_job_scope, role_analysis_for_run

router = APIRouter()


@router.get("/workspace/boot")
def workspace_boot(
    profile: Literal["full", "summary"] = "full",
    candidate_limit: int = Query(50, ge=1, le=100),
) -> JSONResponse:
    from .health import health_payload

    content: dict[str, object] = {
        "schema": "assay.workspace_boot.v1",
        "health": health_payload(),
        "candidate_summaries": list_candidate_summaries(limit=candidate_limit),
    }
    if profile == "summary":
        content["exam_pack_summaries"] = list_exam_pack_summaries()
    else:
        packs = list_exam_packs()
        content["exam_packs"] = [pack.model_dump(mode="json") for pack in packs]
    return JSONResponse(
        content=content,
        headers=public_read_json_headers(),
    )


@router.get("/runs")
def runs() -> list[dict]:
    # Enrich each run with a lightweight scorecard summary so the Experiments
    # table renders verdict/score without an N+1 per-row scorecard fetch.
    run_records = list_runs()
    scorecards = get_scorecards([run.id for run in run_records if run.status == "completed"])
    items: list[dict] = []
    for run in run_records:
        item = run.model_dump(mode="json")
        if run.status == "completed":
            scorecard = scorecards.get(run.id)
            if scorecard is not None:
                passes = scorecard.pass_at_k or {}
                item["certified"] = scorecard.certified
                item["pass_count"] = sum(1 for v in passes.values() if v)
                item["total_count"] = len(passes)
                item["degraded"] = scorecard.degraded
                item["qualification_status"] = scorecard.qualification_status
                item["role_brief_summary"] = scorecard.role_brief_summary
        items.append(item)
    return items


@router.get("/runs/summary")
def run_summaries() -> JSONResponse:
    return JSONResponse(
        content=_run_summary_rows(list_run_summaries(), list_candidate_summaries()),
        headers=public_read_json_headers(),
    )


@router.post("/runs", dependencies=[Depends(rate_limit("create_run"))])
def create_run(payload: RunCreate) -> dict:
    if get_candidate(payload.candidate_id) is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if payload.baseline_run_id is not None:
        if get_run(payload.baseline_run_id) is None:
            raise HTTPException(status_code=404, detail="Baseline run not found")
        if get_scorecard(payload.baseline_run_id) is None:
            raise HTTPException(status_code=409, detail="Baseline run has no scorecard yet")
    try:
        get_exam_pack(payload.exam_pack_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Exam pack not found") from exc

    exam_pack_id = payload.exam_pack_id
    # Legacy role-scoped flow: a job scope sent with the HR pack lets role
    # intelligence pick the closest pack. The guardrail pack (the default) is
    # never swapped out; its runs still carry the scope as exam context.
    if payload.job_scope is not None and exam_pack_id == "hr-v1":
        exam_pack_id = analyze_job_scope(payload.job_scope).recommended_exam_pack_id

    # Live (OpenAI) candidates fire k x items x 2 LLM calls per run; on a
    # rate-limited key that is slow. ASSAY_LIVE_K caps k for OpenAI-played
    # candidates only (an HTTP agent paces itself).
    effective_k = payload.k
    live_k_env = os.environ.get("ASSAY_LIVE_K", "").strip()
    if live_k_env:
        candidate = get_candidate(payload.candidate_id)
        if candidate is not None and candidate.adapter_type == "openai-compatible":
            try:
                effective_k = max(1, min(payload.k, int(live_k_env)))
            except ValueError:
                pass

    run = RunRecord(
        candidate_id=payload.candidate_id,
        exam_pack_id=exam_pack_id,
        k=effective_k,
        competency_threshold=payload.competency_threshold,
        max_transfer_gap=payload.max_transfer_gap,
        tas_threshold=payload.tas_threshold,
        policy_name=payload.policy_name,
        job_scope=payload.job_scope,
        baseline_run_id=payload.baseline_run_id,
    )
    return save_run(run).model_dump(mode="json")


@router.post("/runs/{run_id}/start", dependencies=[Depends(rate_limit("start_run"))])
async def start_run(run_id: str) -> dict:
    run = get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    candidate = get_candidate(run.candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if run.status == "completed":
        scorecard = get_scorecard(run.id)
        return scorecard.model_dump(mode="json") if scorecard else run.model_dump(mode="json")
    from ..adapters.base import CandidateAdapterError
    from ..model_access import ModelUnavailableError
    from ..orchestrator import RunOrchestrator

    try:
        scorecard = await RunOrchestrator().start(run, candidate)
    except ModelUnavailableError as exc:
        # Nothing real can answer the exam on this server; say so plainly.
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except CandidateAdapterError as exc:
        # The model or agent failed mid-run (rate limit, bad endpoint). The run
        # is recorded as failed; no answers were substituted.
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return scorecard.model_dump(mode="json")


@router.get("/runs/{run_id}")
def get_run_endpoint(run_id: str) -> dict:
    run = get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return run.model_dump(mode="json")


@router.get("/runs/{run_id}/events")
def run_events(run_id: str, after: int | None = None) -> JSONResponse:
    run = get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    events = list_events(run_id, after=after)
    return JSONResponse(
        content=[event.model_dump(mode="json") for event in events],
        headers=_run_json_cache_headers(run),
    )


@router.get("/runs/{run_id}/scorecard")
def run_scorecard(run_id: str) -> JSONResponse:
    scorecard = get_scorecard(run_id)
    if scorecard is None:
        raise HTTPException(status_code=404, detail="Scorecard not found")
    run = get_run(run_id)
    return JSONResponse(
        content=_scorecard_payload(scorecard, include_trace_raw=False),
        headers=_run_json_cache_headers(run) if run else public_read_json_headers(cacheable=False),
    )


def _run_json_cache_headers(run: RunRecord) -> dict[str, str]:
    return public_read_json_headers(cacheable=run.status == "completed")


@router.get("/runs/{run_id}/verdict")
def run_verdict(run_id: str) -> JSONResponse:
    """Slim first-paint payload for the run detail page.

    Bundles the records needed to render the verdict strip and action controls
    without assembling the heavier proof surfaces.
    """
    run = get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    candidate = get_candidate(run.candidate_id)
    scorecard = get_scorecard(run_id)
    deployability = None
    comparison = None
    if scorecard is not None:
        deployability = evaluate_scorecard(scorecard, policy_for_run(run)).model_dump(
            mode="json",
            by_alias=True,
        )
        if run.baseline_run_id or scorecard.prior_run_id:
            comparison_payload = run_comparison(
                run_id,
                run.baseline_run_id,
                run_record=run,
                current_scorecard=scorecard,
            )
            comparison = comparison_payload.model_dump(mode="json") if comparison_payload else None
    payload = {
        "schema": "assay.run_verdict.v1",
        "run": run.model_dump(mode="json"),
        "candidate": (
            {
                "id": candidate.id,
                "name": candidate.name,
                "adapter_type": candidate.adapter_type,
                "created_at": candidate.created_at.isoformat(),
            }
            if candidate is not None
            else None
        ),
        "scorecard": _scorecard_payload(scorecard, include_trace_raw=False) if scorecard else None,
        "deployability": deployability,
        "comparison": comparison,
    }
    return JSONResponse(
        content=payload,
        headers=_run_json_cache_headers(run),
    )


@router.get("/runs/{run_id}/surfaces")
def run_surfaces(run_id: str) -> JSONResponse:
    """Lean secondary payload for non-critical run detail panels.

    The first paint uses ``/verdict``. This endpoint batches the lower-priority
    learning and reviewer surfaces so the web app does not fan out into several
    Python function invocations right after the verdict strip renders.
    """
    run = get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    scorecard = get_scorecard(run_id)
    events = list_events(run_id)

    try:
        agent_spec = agent_spec_payload(
            run_id,
            run_record=run,
            scorecard=scorecard,
            events=events,
        )
    except KeyError as exc:
        raise HTTPException(status_code=409, detail="Run references an unregistered exam pack") from exc

    product_review = product_review_for_run(
        run_id,
        run_record=run,
        scorecard=scorecard,
        events=events,
    )
    progress_payload = candidate_progress(run.candidate_id)
    diagnostic_library = [
        lesson.model_dump(mode="json") for lesson in lesson_library(run.candidate_id)
    ]
    payload = {
        "schema": "assay.run_surfaces.v1",
        "run_id": run_id,
        "agent_spec": agent_spec,
        "product_review": product_review.model_dump(mode="json") if product_review else None,
        "candidate_progress": progress_payload.model_dump(mode="json") if progress_payload else None,
        "diagnostic_library": diagnostic_library,
    }
    return JSONResponse(
        content=payload,
        headers=_run_json_cache_headers(run),
    )


@router.get("/runs/{run_id}/payoff")
def run_payoff(run_id: str) -> JSONResponse:
    """Slim payoff payload for the home page after a run completes.

    The live run already has the scorecard in hand. This endpoint returns only
    the policy decision and refined agent spec needed for the verdict screen,
    avoiding the broader proof/detail assembly until the user asks for evidence.
    """
    run = get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    scorecard = get_scorecard(run_id)
    if scorecard is None:
        raise HTTPException(status_code=409, detail="Run has no scorecard yet; start the run first")
    events = list_events(run_id)
    try:
        agent_spec = agent_spec_payload(
            run_id,
            run_record=run,
            scorecard=scorecard,
            events=events,
        )
    except KeyError as exc:
        raise HTTPException(status_code=409, detail="Run references an unregistered exam pack") from exc
    payload = {
        "schema": "assay.run_payoff.v1",
        "run_id": run_id,
        "agent_spec": agent_spec,
        "deployability": evaluate_scorecard(scorecard, policy_for_run(run)).model_dump(
            mode="json",
            by_alias=True,
        ),
    }
    return JSONResponse(
        content=payload,
        headers=_run_json_cache_headers(run),
    )


@router.get("/runs/{run_id}/deployability")
def run_deployability(run_id: str, policy: str | None = None) -> dict:
    """The deployability decision for a run under its own policy.

    ``policy`` optionally re-judges under a named policy (what-if view); only
    built-in names are accepted — never file paths over HTTP.
    """
    run = get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if policy is not None and policy not in ("strict", "advisory"):
        raise HTTPException(status_code=422, detail="policy must be 'strict' or 'advisory'")
    scorecard = get_scorecard(run_id)
    if scorecard is None:
        raise HTTPException(status_code=409, detail="Run has no scorecard yet; start the run first")
    decision = evaluate_scorecard(scorecard, policy_for_run(run, policy))
    return decision.model_dump(mode="json", by_alias=True)


@router.get("/runs/{run_id}/badge.svg")
def run_badge(run_id: str) -> Response:
    """Embeddable SVG status badge for a run — a shareable proof artifact.

    Always returns an SVG (200) so a README embed never shows a broken image:
    an unknown/unscored run renders a neutral 'pending' badge.
    """
    run = get_run(run_id)
    scorecard = get_scorecard(run_id) if run is not None else None
    verdict = None
    detail = ""
    a_hash = None
    if run is not None and scorecard is not None:
        decision = evaluate_scorecard(scorecard, policy_for_run(run))
        verdict = decision.verdict
        detail = f"pass^{scorecard.k}" if scorecard.trials_stochastic else "demo"
        candidate = get_candidate(run.candidate_id)
        a_hash = agent_hash(candidate.system_prompt if candidate else None)
    svg = badge_svg(verdict, detail=detail, agent_hash=a_hash)
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={"Cache-Control": "max-age=60, public"},
    )


@router.get("/runs/{run_id}/card.svg")
def run_card(run_id: str) -> Response:
    """Shareable verdict card (SVG) — a richer proof artifact than the badge.

    Public like the badge (embeddable as an <img>); the web app rasterizes it to
    a downloadable PNG. Always 200 so an embed never breaks.
    """
    from ..verdict_card import card_svg

    run = get_run(run_id)
    scorecard = get_scorecard(run_id) if run is not None else None
    if run is None or scorecard is None:
        svg = card_svg(
            agent_name="Agent", run_id=run_id, band="pending", score=None,
            pass_count=0, pass_total=0, tas=None, max_gap=0.0,
        )
        return Response(content=svg, media_type="image/svg+xml",
                        headers={"Cache-Control": "max-age=30, public"})

    decision = evaluate_scorecard(scorecard, policy_for_run(run))
    band = {"ship": "ship", "probation": "risky", "do_not_ship": "hold", "unverified": "unverified"}.get(
        decision.verdict, "pending"
    )
    passes = scorecard.pass_at_k or {}
    held = list((scorecard.held_out_scores or {}).values())
    score = round(sum(held) / len(held) * 100) if held else None
    gaps = list((scorecard.transfer_gap or {}).values())
    candidate = get_candidate(run.candidate_id)
    finding = decision.blocking_reasons[0] if decision.blocking_reasons else (
        decision.warnings[0] if decision.warnings else ""
    )
    svg = card_svg(
        agent_name=candidate.name if candidate else "Agent",
        run_id=run_id,
        band=band,
        score=score,
        pass_count=sum(1 for v in passes.values() if v),
        pass_total=len(passes),
        tas=scorecard.trace_audit.tas_score if scorecard.trace_audit.status == "ok" else None,
        max_gap=max(gaps) if gaps else 0.0,
        top_finding=_prettify_card_finding(finding),
        policy_name=decision.policy.name,
    )
    return Response(content=svg, media_type="image/svg+xml",
                    headers={"Cache-Control": "max-age=60, public"})


def _prettify_card_finding(reason: str) -> str:
    import re

    return re.sub(r"\b[a-z]+(?:_[a-z]+)+\b", lambda m: m.group(0).replace("_", " ").title(), reason or "")


def _run_summary_rows(runs: list[dict], candidates: list[dict]) -> list[dict[str, object]]:
    candidate_by_id = {str(candidate["id"]): candidate for candidate in candidates if candidate.get("id")}
    rows: list[dict[str, object]] = []
    for run in runs:
        row: dict[str, object] = dict(run)
        candidate_id = str(row.get("candidate_id") or "")
        candidate = candidate_by_id.get(candidate_id)
        row["candidate_name"] = str(candidate.get("name") or candidate_id) if candidate else candidate_id
        row["candidate_adapter_type"] = (
            str(candidate.get("adapter_type") or "unknown") if candidate else "unknown"
        )
        rows.append(row)
    return rows


@router.get("/runs/{run_id}/trace")
def run_trace(run_id: str) -> JSONResponse:
    run = get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    scorecard = get_scorecard(run_id)
    return JSONResponse(
        content={
            "run_id": run_id,
            "events": [event.model_dump(mode="json") for event in list_events(run_id)],
            "scorecard": _scorecard_payload(scorecard, include_trace_raw=False) if scorecard else None,
        },
        headers=_run_json_cache_headers(run),
    )


@router.get("/runs/{run_id}/comparison")
def run_comparison_endpoint(run_id: str, baseline: str | None = None) -> JSONResponse:
    run = get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    payload = run_comparison(run_id, baseline)
    if payload is None:
        raise HTTPException(status_code=409, detail="Run has no scorecard yet; start the run first")
    return JSONResponse(
        content=payload.model_dump(mode="json"),
        headers=_run_json_cache_headers(run),
    )


@router.get("/runs/{run_id}/lessons-applied")
def run_lessons_applied(run_id: str) -> JSONResponse:
    run = get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    scorecard = get_scorecard(run_id)
    if scorecard is None:
        return JSONResponse(content=[], headers=_run_json_cache_headers(run))
    lessons_by_id = get_lessons(scorecard.lessons_applied)
    resolved = [lessons_by_id.get(lesson_id) for lesson_id in scorecard.lessons_applied]
    return JSONResponse(
        content=[lesson.model_dump(mode="json") for lesson in resolved if lesson is not None],
        headers=_run_json_cache_headers(run),
    )


@router.get("/runs/{run_id}/agent-spec")
def run_agent_spec(run_id: str) -> JSONResponse:
    run = get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    try:
        payload = agent_spec_payload(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=409, detail="Run references an unregistered exam pack") from exc
    if payload is None:
        raise HTTPException(status_code=409, detail="Run has no scorecard yet; start the run first")
    return JSONResponse(
        content=payload,
        headers=_run_json_cache_headers(run),
    )


@router.get("/runs/{run_id}/agent-spec/diff")
def run_agent_spec_diff(run_id: str) -> JSONResponse:
    """Structured before/after diff between the uploaded and refined agent md."""
    run = get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    try:
        payload = diff_payload(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=409, detail="Run references an unregistered exam pack") from exc
    if payload is None:
        raise HTTPException(status_code=409, detail="Run has no scorecard yet; start the run first")
    return JSONResponse(
        content=payload,
        headers=_run_json_cache_headers(run),
    )


@router.get("/runs/{run_id}/proof-bundle")
def run_proof_bundle(run_id: str) -> dict:
    bundle = proof_bundle(run_id)
    if bundle is None:
        raise HTTPException(status_code=404, detail="Run not found")
    try:
        db_health = database_health()
    except Exception as exc:
        db_health = {"ok": False, "error": str(exc)}
    try:
        agent_spec = agent_spec_payload(run_id)
    except KeyError:
        agent_spec = None
    try:
        role_analysis_bundle = role_analysis_for_run(run_id)
    except Exception:
        role_analysis_bundle = None
    run_record = get_run(run_id)
    progress_bundle = None
    diagnostic_library: list[dict] = []
    if run_record is not None:
        progress_payload = candidate_progress(run_record.candidate_id)
        progress_bundle = progress_payload.model_dump(mode="json") if progress_payload else None
        diagnostic_library = [
            lesson.model_dump(mode="json") for lesson in lesson_library(run_record.candidate_id)
        ]
    return bundle | {
        "database": db_health,
        "agent_spec": agent_spec,
        "role_analysis": role_analysis_bundle,
        "candidate_progress": progress_bundle,
        "diagnostic_library": diagnostic_library,
    }


@router.get("/runs/{run_id}/detail")
def run_detail(run_id: str) -> JSONResponse:
    try:
        backend = database_backend_name()
    except Exception:
        backend = "unknown"
    bundle = proof_bundle(
        run_id,
        include_events=False,
        product_review_db_health={
            "ok": True,
            "backend": backend,
            "scope": "read-path",
        },
    )
    if bundle is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if bundle.get("scorecard"):
        bundle["scorecard"] = _strip_scorecard_trace_raw(bundle["scorecard"])
    try:
        agent_spec = agent_spec_payload(run_id)
    except KeyError:
        agent_spec = None
    run_record = get_run(run_id)
    progress_bundle = None
    diagnostic_library: list[dict] = []
    if run_record is not None:
        progress_payload = candidate_progress(run_record.candidate_id)
        progress_bundle = progress_payload.model_dump(mode="json") if progress_payload else None
        diagnostic_library = [
            lesson.model_dump(mode="json") for lesson in lesson_library(run_record.candidate_id)
        ]
    payload = bundle | {
        "detail_profile": "fast",
        "agent_spec": agent_spec,
        "candidate_progress": progress_bundle,
        "diagnostic_library": diagnostic_library,
    }
    return JSONResponse(
        content=payload,
        headers=_run_json_cache_headers(run_record) if run_record else public_read_json_headers(cacheable=False),
    )


def _scorecard_payload(scorecard, *, include_trace_raw: bool = True) -> dict:
    payload = scorecard.model_dump(mode="json")
    if include_trace_raw:
        return payload
    return _strip_scorecard_trace_raw(payload)


def _strip_scorecard_trace_raw(payload: dict) -> dict:
    trace_audit = payload.get("trace_audit")
    if isinstance(trace_audit, dict):
        trace_audit["raw"] = {}
    return payload
