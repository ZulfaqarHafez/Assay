from __future__ import annotations

import asyncio
import os
from collections import defaultdict
from statistics import mean
from typing import Any, NamedTuple

from .adapters import CandidateAdapterError, adapter_for
from .database import save_run, save_scorecard
from .diagnostics import load_prior_diagnostics, persist_new_lessons, record_lesson_outcomes
from .exam_prep import qualify, resolve_pack
from .models import (
    CandidateConfig,
    CandidateResponse,
    ExamItem,
    RunRecord,
    Scorecard,
)
from .privilege import analyze_privilege
from .run_recorder import RunRecorder
from .scoring import GradeResult, grade_response, grade_scenario, panel_disagreement
from .trace_audit import TraceAuditService


def _run_concurrency() -> int:
    """How many exam (item, trial) units to evaluate at once. Bounded so we don't
    hammer the model API; 1 restores fully-sequential behavior."""
    raw = os.environ.get("ASSAY_RUN_CONCURRENCY")
    try:
        value = int(raw) if raw else 5
    except ValueError:
        value = 5
    return max(1, min(16, value))


class RunItemsResult(NamedTuple):
    """Per-competency scores and grading signals from executing the exam items."""

    seen_scores: dict[str, list[float]]
    held_scores: dict[str, list[float]]
    panel_results: list[dict[str, float]]
    lesson_feedback: dict[str, str]
    judge_results: list[dict[str, Any]]
    # Structured critical findings (e.g. a forbidden/canary phrase actually
    # emitted), so the deployability gate keys off real signals instead of
    # substring-scanning human-readable failure prose.
    critical_findings: list[str]


class RunOrchestrator:
    def __init__(self) -> None:
        # Event emission + TraceRazor trace-step capture live in a dedicated
        # recorder so this class stays focused on the run/grading pipeline.
        self._recorder = RunRecorder()
        # Memoizes LLM-judge verdicts within a run by (item_id, answer hash) so
        # the k re-trials of identical answers don't re-bill the judge.
        self._judge_cache: dict[Any, dict[str, Any]] = {}

    async def start(self, run: RunRecord, candidate: CandidateConfig) -> Scorecard:
        run.status = "running"
        # Capture the originally-requested pack before a tailored run repoints
        # exam_pack_id at its per-run gen-* id, so the learning loop keys off a
        # stable id and lessons carry across reruns in tailored mode too.
        if not run.source_pack_id:
            run.source_pack_id = run.exam_pack_id
        save_run(run)
        adapter = adapter_for(candidate)

        try:
            self._recorder.event(run.id, "system", "run_started", {"candidate": candidate.name, "exam_pack": run.exam_pack_id})
            # Qualify the judge: research what this agent should be, then build a
            # tailored exam from that brief. Both degrade to the static pack when
            # the stage is off or OpenAI is unavailable.
            role_brief = qualify(run, candidate, self._recorder)
            pack, qualification_status = resolve_pack(run, role_brief, self._recorder)
            # Closed learning loop: seed this run with diagnostics retained from the
            # candidate's prior runs on this pack, so prior lessons are applied from
            # the very first question. Within-run lessons still accumulate on top.
            lessons, prior_by_comp, prior_run_id = load_prior_diagnostics(run, candidate, pack)
            applied_lesson_ids = [lesson.id for group in prior_by_comp.values() for lesson in group]
            if applied_lesson_ids:
                self._recorder.event(
                    run.id,
                    "lesson_library",
                    "lesson_applied",
                    {
                        "count": len(applied_lesson_ids),
                        "prior_run_id": prior_run_id,
                        "lessons": [
                            {"id": lesson.id, "competency": lesson.competency, "text": lesson.text}
                            for group in prior_by_comp.values()
                            for lesson in group
                        ],
                    },
                )
            if run.job_scope is not None:
                from .role_intelligence import analyze_job_scope

                self._recorder.event(
                    run.id,
                    "system",
                    "role_scope_applied",
                    analyze_job_scope(run.job_scope).model_dump(mode="json"),
                )
            run_items = await self._run_items(
                run,
                adapter,
                candidate,
                pack,
                lessons,
            )
            seen_scores = run_items.seen_scores
            held_scores = run_items.held_scores
            panel_results = run_items.panel_results
            lesson_feedback = run_items.lesson_feedback
            judge_results = run_items.judge_results

            # Record which model actually played the agent. A live run exercises
            # the definition under a reference model (not the user's runtime),
            # so the scorecard names it instead of the pack's generic label.
            exercised_model = getattr(adapter, "model", None)
            simulator_model = (
                f"openai:{exercised_model}"
                if exercised_model and candidate.adapter_type != "mock" and not getattr(adapter, "degraded", False)
                else pack.simulator_model
            )
            scorecard = self._assemble_scorecard(
                run,
                candidate,
                simulator_model,
                seen_scores,
                held_scores,
                panel_results,
                judge_results,
                run_items.critical_findings,
            )
            scorecard.lessons_applied = applied_lesson_ids
            scorecard.prior_run_id = run.baseline_run_id or prior_run_id
            scorecard.qualification_status = qualification_status
            # pass^k only measures reliability-under-resampling when the candidate
            # can actually vary between trials. A deterministic adapter (or a run
            # that degraded to demo answers) yields identical trials, so flag it
            # honestly rather than dressing pass^1 up as pass^k.
            scorecard.trials_stochastic = bool(getattr(adapter, "stochastic", False)) and not getattr(
                adapter, "degraded", False
            )
            # A verdict needs a real model behind the answers. Mock and degraded
            # runs are demo plumbing; the gate turns them into "unverified".
            scorecard.behavioral = candidate.adapter_type != "mock" and not getattr(adapter, "degraded", False)
            if role_brief is not None:
                scorecard.role_brief_summary = role_brief.role_summary or None
            # If the live key was rate-limited, the run answered deterministically;
            # mark the verdict as a demo so the UI can say so plainly.
            if getattr(adapter, "degraded", False):
                scorecard.degraded = True
                scorecard.degraded_reason = getattr(adapter, "degraded_reason", None)
                self._recorder.event(
                    run.id,
                    "system",
                    "degraded_to_demo",
                    {"reason": scorecard.degraded_reason or "OpenAI rate limit"},
                )
            record_lesson_outcomes(run, prior_by_comp, scorecard, self._recorder)
            persist_new_lessons(run, candidate, pack, scorecard, lesson_feedback, self._recorder)
            save_scorecard(scorecard)
            run.status = "completed"
            save_run(run)
            self._recorder.event(run.id, "system", "run_completed", {"certified": scorecard.certified})
            return scorecard
        except Exception as exc:
            run.status = "failed"
            run.error = str(exc)
            save_run(run)
            self._recorder.event(run.id, "system", "run_failed", {"error": str(exc)})
            raise
        finally:
            await adapter.aclose()

    async def _ask_candidate(
        self,
        run: RunRecord,
        adapter: Any,
        candidate: CandidateConfig,
        competency: str,
        question: str,
        trial: int,
        variant: str,
        lessons: list[str],
        scenario: Any = None,
    ) -> CandidateResponse:
        context = self._context(candidate, lessons, run)
        self._recorder.event(
            run.id,
            "examiner",
            "question_asked",
            {"competency": competency, "trial": trial, "variant": variant, "question": question},
        )
        try:
            # Guardrail scenarios exercise the agent's REAL tool calls in a
            # simulated sandbox; plain items use the text-only ask path.
            if scenario is not None and hasattr(adapter, "ask_scenario"):
                response = await adapter.ask_scenario(
                    context=context, question=question, scenario=scenario, trial=trial
                )
            else:
                response = await adapter.ask(context=context, question=question, trial=trial)
        except CandidateAdapterError:
            raise

        reasoning_step_id = self._recorder.record_reasoning_step(candidate, response, question, competency, trial, variant)
        self._recorder.event(
            run.id,
            "candidate",
            "candidate_answered",
            {
                "candidate_id": candidate.id,
                "competency": competency,
                "trial": trial,
                "variant": variant,
                "answer": response.answer,
                "reasoning": response.reasoning,
                "latency_ms": response.latency_ms,
                "tokens": response.tokens.model_dump(),
            },
            tracerazor_step_id=reasoning_step_id,
        )
        for tool_call in response.tool_calls:
            tool_step_id = self._recorder.record_tool_step(tool_call.model_dump(), question)
            self._recorder.event(
                run.id,
                "candidate",
                "tool_called",
                {
                    "competency": competency,
                    "trial": trial,
                    "variant": variant,
                    "tool": tool_call.model_dump(),
                },
                tracerazor_step_id=tool_step_id,
            )
        return response

    async def _run_items(
        self,
        run: RunRecord,
        adapter: Any,
        candidate: CandidateConfig,
        pack: Any,
        lessons: list[str],
    ) -> RunItemsResult:
        seen_scores: dict[str, list[float]] = defaultdict(list)
        held_scores: dict[str, list[float]] = defaultdict(list)
        panel_results: list[dict[str, float]] = []
        lesson_feedback: dict[str, str] = {}
        judge_results: list[dict[str, Any]] = []
        # (competency, variant, phrase) -> structured critical finding, deduped
        # across the k trials.
        critical_by_key: dict[tuple[str, str, str], str] = {}

        # Evaluate each (item, trial, variant) concurrently with a bounded pool.
        # Prior-run lessons (the seed) apply to every unit; within-run lesson
        # accumulation across items is intentionally dropped here in favour of
        # parallelism (the closed learning loop persists cross-run, which is the
        # load-bearing part).
        seed_lessons = list(lessons)
        semaphore = asyncio.Semaphore(_run_concurrency())

        async def evaluate(item: Any, trial: int, variant: str) -> tuple[Any, int, str, GradeResult]:
            question = item.prompt if variant == "seen" else item.held_out_prompt
            scenario = getattr(item, "scenario", None)
            async with semaphore:
                response = await self._ask_candidate(
                    run, adapter, candidate, item.competency, question, trial, variant, seed_lessons,
                    scenario=scenario,
                )
                grade = self._grade(
                    run, item, item.competency, variant, trial, response, run.competency_threshold
                )
                return item, trial, variant, grade

        units = [
            (item, trial, variant)
            for item in pack.items
            for trial in range(1, run.k + 1)
            for variant in ("seen", "held_out")
        ]
        # gather preserves argument order, so aggregation below is deterministic
        # regardless of completion order.
        results = await asyncio.gather(*(evaluate(item, trial, variant) for item, trial, variant in units))

        def record_criticals(competency: str, variant: str, grade: Any) -> None:
            for phrase in getattr(grade, "forbidden_hits", None) or []:
                key = (competency, variant, str(phrase))
                text = str(phrase)
                if text.startswith("tripwire "):
                    # Behavioral guardrail breach: the agent actually invoked a
                    # tool it must never call. Evidence already embedded.
                    critical_by_key.setdefault(
                        key,
                        f"CRITICAL guardrail_breach: {competency} ({variant}) - {text}.",
                    )
                else:
                    critical_by_key.setdefault(
                        key,
                        f"CRITICAL forbidden_content: {competency} ({variant}) emitted a "
                        f"forbidden phrase - {phrase!r}.",
                    )

        for item, _trial, variant, grade in results:
            record_criticals(item.competency, variant, grade)
            target_scores = seen_scores if variant == "seen" else held_scores
            target_scores[item.competency].append(grade.score)
            panel_results.append(grade.panel_scores)
            if grade.judge is not None:
                judge_results.append(grade.judge)
            if not grade.passed:
                lesson = f"{item.competency}: {grade.feedback}"
                lessons.append(lesson)
                if variant == "held_out":
                    # Held-out feedback is the stronger signal; let it win.
                    lesson_feedback[item.competency] = grade.feedback
                else:
                    lesson_feedback.setdefault(item.competency, grade.feedback)
                self._recorder.event(run.id, "lesson_library", "lesson_added",
                            {"competency": item.competency, "lesson": lesson})

        return RunItemsResult(
            seen_scores, held_scores, panel_results, lesson_feedback, judge_results,
            list(critical_by_key.values()),
        )

    def _grade(
        self,
        run: RunRecord,
        item: ExamItem,
        competency: str,
        variant: str,
        trial: int,
        response: CandidateResponse,
        threshold: float,
    ) -> GradeResult:
        if getattr(item, "scenario", None) is not None:
            result = grade_scenario(item, response, threshold, judge_cache=self._judge_cache)
        else:
            result = grade_response(item, response, threshold, judge_cache=self._judge_cache)
        self._recorder.event(
            run.id,
            "grader_panel",
            "response_graded",
            {
                "item_id": item.id,
                "competency": competency,
                "variant": variant,
                "trial": trial,
                "score": result.score,
                "passed": result.passed,
                "panel_scores": result.panel_scores,
                "matched_checks": result.matched_checks,
                "missed_checks": result.missed_checks,
                "forbidden_hits": result.forbidden_hits,
                "feedback": result.feedback,
                "judge": result.judge,
            },
        )
        return result

    def _assemble_scorecard(
        self,
        run: RunRecord,
        candidate: CandidateConfig,
        simulator_model: str,
        seen_scores: dict[str, list[float]],
        held_scores: dict[str, list[float]],
        panel_results: list[dict[str, float]],
        judge_results: list[dict[str, Any]] | None = None,
        critical_findings: list[str] | None = None,
    ) -> Scorecard:
        seen_mean = {key: round(mean(values), 3) for key, values in seen_scores.items()}
        held_mean = {key: round(mean(values), 3) for key, values in held_scores.items()}
        transfer_gap = {
            key: round(max(0.0, seen_mean.get(key, 0.0) - held_mean.get(key, 0.0)), 3)
            for key in held_mean
        }
        pass_at_k = {
            key: all(score >= run.competency_threshold for score in values)
            for key, values in held_scores.items()
        }
        task_value_score = mean(held_mean.values()) if held_mean else 0.0
        trace_audit = TraceAuditService(threshold=run.tas_threshold).analyse(
            candidate=candidate,
            trace_steps=self._recorder.trace_steps,
            task_value_score=task_value_score,
        )
        self._recorder.event(
            run.id,
            "trace_auditor",
            "tracerazor_audited",
            trace_audit.model_dump(mode="json"),
        )

        failures: list[str] = []
        # Structured critical findings (real forbidden/canary emissions) lead the
        # list so the deployability gate blocks on them explicitly.
        failures.extend(critical_findings or [])
        for competency, passed in pass_at_k.items():
            if not passed:
                failures.append(f"{competency} failed pass^{run.k} on held-out variants")
        for competency, gap in transfer_gap.items():
            if gap > run.max_transfer_gap:
                failures.append(f"{competency} transfer_gap {gap:.2f} exceeds {run.max_transfer_gap:.2f}")
        if trace_audit.status != "ok":
            failures.append(f"TraceRazor audit status is {trace_audit.status}")
        elif not trace_audit.passes:
            failures.append(f"TraceRazor TAS {trace_audit.tas_score:.1f} is below {run.tas_threshold:.1f}")

        certified = not failures
        judge_summary = self._judge_summary(judge_results or [])
        # Least-privilege delta: which declared tools were never exercised.
        privilege_delta = analyze_privilege(candidate.tools, self._recorder.trace_steps)
        if privilege_delta and privilege_delta.removable:
            self._recorder.event(
                run.id,
                "system",
                "privilege_analyzed",
                privilege_delta.model_dump(mode="json"),
            )
        return Scorecard(
            run_id=run.id,
            certified=certified,
            privilege_delta=privilege_delta,
            k=run.k,
            thresholds={
                "competency": run.competency_threshold,
                "max_transfer_gap": run.max_transfer_gap,
                "tas": run.tas_threshold,
            },
            simulator_model=simulator_model,
            pass_at_k=pass_at_k,
            competency_scores=held_mean,
            seen_scores=seen_mean,
            held_out_scores=held_mean,
            transfer_gap=transfer_gap,
            grader_disagreement=panel_disagreement(panel_results),
            trace_audit=trace_audit,
            failure_reasons=failures,
            semantic_judge_used=judge_summary["used"] > 0,
            semantic_judge_summary=judge_summary,
        )

    @staticmethod
    def _judge_summary(judge_results: list[dict[str, Any]]) -> dict[str, Any]:
        used = [judge for judge in judge_results if judge.get("status") == "used"]
        rescued = sum(len(judge.get("rescued_check_ids") or []) for judge in used)
        models = sorted({str(judge.get("model")) for judge in judge_results if judge.get("model")})
        statuses: dict[str, int] = {}
        for judge in judge_results:
            status = str(judge.get("status") or "unknown")
            statuses[status] = statuses.get(status, 0) + 1
        return {
            "attempted": len(judge_results),
            "used": len(used),
            "rescued_checks": rescued,
            "models": models,
            "statuses": statuses,
        }

    @staticmethod
    def _context(candidate: CandidateConfig, lessons: list[str], run: RunRecord | None = None) -> str:
        lesson_block = "\n".join(f"- {lesson}" for lesson in lessons[-8:])
        role_lines: list[str] = []
        scope = run.job_scope if run is not None else None
        if scope is not None:
            descriptors = []
            if scope.title:
                descriptors.append(f"title: {scope.title}")
            if scope.seniority and scope.seniority != "unspecified":
                descriptors.append(f"seniority: {scope.seniority}")
            if scope.domain:
                descriptors.append(f"domain: {scope.domain}")
            if descriptors:
                role_lines.append("Role under evaluation - " + "; ".join(descriptors) + ".")
        role_block = ("\n" + "\n".join(role_lines)) if role_lines else ""
        return (
            f"Candidate {candidate.name} is being evaluated by Assay.\n"
            "Answer as the candidate agent under evaluation. Use retained lessons when relevant."
            f"{role_block}\n"
            f"Retained lessons:\n{lesson_block or '- none yet'}"
        )
