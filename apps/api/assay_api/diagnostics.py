from __future__ import annotations

from collections import defaultdict
from typing import Any, NamedTuple

from .database import list_lessons_for_candidate, list_runs_for_candidate, save_lesson
from .models import CandidateConfig, DiagnosticLesson, LessonOutcome, RunRecord, Scorecard, utc_now
from .run_recorder import RunRecorder


class PriorDiagnostics(NamedTuple):
    """Lessons retained from this candidate's prior runs, seeded into a run."""

    seed_lessons: list[str]
    by_competency: dict[str, list[DiagnosticLesson]]
    prior_run_id: str | None


def load_prior_diagnostics(
    run: RunRecord,
    candidate: CandidateConfig,
    pack: Any,
) -> PriorDiagnostics:
    """Seed the run with active lessons retained from this candidate's prior
    runs on the same pack, grouped by competency for outcome tracking.
    """
    competencies = sorted({item.competency for item in pack.items})
    lesson_key = run.source_pack_id or run.exam_pack_id
    prior = list_lessons_for_candidate(candidate.id, lesson_key, competencies, active_only=True)
    by_comp: dict[str, list[DiagnosticLesson]] = defaultdict(list)
    for lesson in prior:
        by_comp[lesson.competency].append(lesson)
    seed = [f"{lesson.competency}: {lesson.text}" for lesson in prior]
    return PriorDiagnostics(seed, by_comp, _prior_run_id(run, candidate))


def _prior_run_id(run: RunRecord, candidate: CandidateConfig) -> str | None:
    """Most recent prior completed run for this candidate on the same pack."""
    run_key = run.source_pack_id or run.exam_pack_id
    prior_runs = [
        record
        for record in list_runs_for_candidate(candidate.id)
        if record.id != run.id
        and (record.source_pack_id or record.exam_pack_id) == run_key
        and record.status == "completed"
    ]
    return prior_runs[-1].id if prior_runs else None


def record_lesson_outcomes(
    run: RunRecord,
    prior_by_comp: dict[str, list[DiagnosticLesson]],
    scorecard: Scorecard,
    recorder: RunRecorder,
) -> None:
    """Record whether each applied lesson's competency improved this run."""
    for competency, lessons_list in prior_by_comp.items():
        score = scorecard.held_out_scores.get(competency)
        if score is None:
            continue
        passed = scorecard.pass_at_k.get(competency, False)
        for lesson in lessons_list:
            if run.id not in lesson.applied_run_ids:
                lesson.applied_run_ids.append(run.id)
            lesson.last_applied_at = utc_now()
            lesson.latest_outcome_score = score
            lesson.latest_outcome = _classify_outcome(passed, [lesson], score)
            if passed:
                # Competency now clears the gate; retire the diagnostic.
                lesson.active = False
            save_lesson(lesson)
            recorder.event(
                run.id,
                "lesson_library",
                "lesson_outcome",
                {
                    "lesson_id": lesson.id,
                    "competency": competency,
                    "outcome": lesson.latest_outcome,
                    "score": score,
                    "origin_score": lesson.origin_score,
                    "retired": not lesson.active,
                },
            )


def _classify_outcome(
    passed: bool,
    lessons_list: list[DiagnosticLesson],
    current_score: float,
) -> LessonOutcome:
    if not passed:
        return "still_failing"
    origin = max((lesson.origin_score for lesson in lessons_list), default=0.0)
    if current_score >= origin + 0.05:
        return "improved"
    if current_score <= origin - 0.05:
        return "regressed"
    return "unchanged"


def persist_new_lessons(
    run: RunRecord,
    candidate: CandidateConfig,
    pack: Any,
    scorecard: Scorecard,
    lesson_feedback: dict[str, str],
    recorder: RunRecorder,
) -> None:
    """Persist one diagnostic per competency that failed this run, deduped by
    (competency, text) against the candidate's existing library so re-runs do
    not multiply rows."""
    lesson_key = run.source_pack_id or run.exam_pack_id
    existing = list_lessons_for_candidate(candidate.id, lesson_key, active_only=False)
    existing_keys = {(lesson.competency, lesson.text) for lesson in existing}
    for competency, passed in scorecard.pass_at_k.items():
        if passed:
            continue
        text = lesson_feedback.get(competency)
        if not text or (competency, text) in existing_keys:
            continue
        lesson = DiagnosticLesson(
            candidate_id=candidate.id,
            exam_pack_id=lesson_key,
            competency=competency,
            text=text,
            origin_run_id=run.id,
            origin_score=scorecard.held_out_scores.get(competency, 0.0),
            origin_variant="held_out",
        )
        save_lesson(lesson)
        existing_keys.add((competency, text))
        recorder.event(
            run.id,
            "lesson_library",
            "lesson_persisted",
            {"lesson_id": lesson.id, "competency": competency, "text": text},
        )
