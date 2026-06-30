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
    """Research the role and record a brief, when the stage is enabled.

    Surfaces the brief as a ``role_qualified`` event. Returns the
    :class:`~assay_api.models.RoleBrief` (or ``None`` when the stage is off) so
    callers can denormalize its summary onto the scorecard.
    """
    if not tailored_exams_enabled():
        return None
    from .role_qualification import build_role_brief

    brief = build_role_brief(run, candidate, mode=qualify_mode())
    recorder.event(run.id, "system", "role_qualified", brief.model_dump(mode="json", by_alias=True))
    return brief


def resolve_pack(run: RunRecord, role_brief: Any, recorder: RunRecorder) -> PackResolution:
    """Pick the exam pack for this run: a tailored pack synthesized from the
    brief, or the run's already-selected static pack.

    When a tailored pack is built it is registered and ``run.exam_pack_id`` is
    repointed at it so the rest of the run (grading, lessons, ``get_exam_pack``)
    is consistent. Synthesis failures fall back to the static pack.
    """
    if role_brief is None:
        return PackResolution(get_exam_pack(run.exam_pack_id), "deterministic")
    from .exam_synthesis import synthesize_exam_pack

    pack, status = synthesize_exam_pack(role_brief, run)
    if status == "tailored":
        run.exam_pack_id = pack.id
        run.generated_pack_id = pack.id
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
