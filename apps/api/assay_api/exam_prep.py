from __future__ import annotations

import os
from typing import Any, NamedTuple

from .database import save_run
from .exam_packs import get_exam_pack
from .models import CandidateConfig, RunRecord
from .run_recorder import RunRecorder


def _flag_enabled(name: str) -> bool:
    return (os.environ.get(name) or "").strip().lower() in {"1", "true", "yes", "on"}


def tailored_exams_enabled() -> bool:
    """Master switch for the role-qualification / tailored-exam stage."""
    return _flag_enabled("ASSAY_TAILORED_EXAMS_ENABLED")


def qualify_mode() -> str:
    mode = (os.environ.get("ASSAY_QUALIFY_MODE") or "fast").strip().lower()
    return mode if mode in ("fast", "deep") else "fast"


class PackResolution(NamedTuple):
    """Outcome of resolving which exam pack a run grades against."""

    pack: Any
    qualification_status: str


def qualify(run: RunRecord, candidate: CandidateConfig, recorder: RunRecorder) -> Any:
    """Qualify the judge and record a ``role_qualified`` brief for the run.

    Always returns a :class:`~assay_api.models.RoleBrief` and emits the event, so
    the "what we held it to" surfaces (judging waterfall, run timeline, proof
    context) are grounded on every run. When the tailored-exam stage is enabled
    the brief is OpenAI-researched (and drives pack synthesis in
    :func:`resolve_pack`); otherwise it is a deterministic, offline brief seeded
    from role intelligence — no network call, grading unchanged.
    """
    if tailored_exams_enabled():
        from .role_qualification import build_role_brief

        brief = build_role_brief(run, candidate, mode=qualify_mode())
    else:
        from .role_qualification import deterministic_brief

        brief = deterministic_brief(run, candidate)
    recorder.event(run.id, "system", "role_qualified", brief.model_dump(mode="json", by_alias=True))
    return brief


def resolve_pack(run: RunRecord, role_brief: Any, recorder: RunRecorder) -> PackResolution:
    """Pick the exam pack for this run: a tailored pack synthesized from the
    brief, or the run's already-selected static pack.

    A tailored pack is only synthesized when the tailored-exam stage is enabled;
    otherwise the run grades against its static pack (status ``deterministic``)
    even though a grounded brief was recorded for the UI. When a tailored pack is
    built it is registered and ``run.exam_pack_id`` is repointed at it so the rest
    of the run (grading, lessons, ``get_exam_pack``) is consistent. Synthesis
    failures fall back to the static pack.
    """
    if role_brief is None or not tailored_exams_enabled():
        return PackResolution(get_exam_pack(run.exam_pack_id), "deterministic")
    from .exam_synthesis import synthesize_exam_pack

    pack, status = synthesize_exam_pack(role_brief, run)
    if status == "tailored":
        run.exam_pack_id = pack.id
        run.generated_pack_id = pack.id
        run.tailored_exam_pack = pack.model_dump(mode="json", by_alias=True)
        save_run(run)
        recorder.event(
            run.id,
            "examiner",
            "tailored_exam_generated",
            {
                "pack_id": pack.id,
                "item_count": len(pack.items),
                "competencies": sorted({item.competency for item in pack.items}),
            },
        )
    return PackResolution(pack, status)
