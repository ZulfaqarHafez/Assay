# Proposal: Part B Tier-3 Separation (orchestrator services + per-product data)

## Status

Shipped on `claude/product-separation-ui-taczio`:

- API routes split into per-surface routers (`assay_api/routers/`).
- Models split into a per-product package (`assay_api/models/`).
- Frontend query layer split into per-product modules (`web/src/lib/queries/`).
- **Seam A (orchestrator decomposition) — done**, in four behavior-preserving,
  fully test-covered increments:
  - `RunRecorder` extracted (`assay_api/run_recorder.py`) — event emission +
    trace-step capture.
  - Stage result contracts (`PackResolution`, `PriorDiagnostics`,
    `RunItemsResult`).
  - Diagnostic Library extracted (`assay_api/diagnostics.py`) — the closed
    learning loop.
  - Exam-prep stage extracted (`assay_api/exam_prep.py`) — qualification + pack
    resolution.

  `RunOrchestrator.start()` now reads as thin glue over named stages and the
  orchestrator shrank from 718 to ~415 lines. The grading core
  (`_run_items` / `_ask_candidate` / `_grade` / `_assemble_scorecard`) was
  **intentionally left in place** — it is the cohesive heart of the run loop and
  fragmenting it further trades clarity for churn (see the strategy's
  anti-over-splitting caution).

**Seam B (per-product table prefixes) — config layer done.** The Supabase table
resolver now namespaces each logical table by product
(`resolve_supabase_tables`), with per-product prefix overrides
(`ASSAY_SUPABASE_PREFIX_AGENTS|RUNS|DIAGNOSTICS`). Defaults are unchanged
(shared `assay_*`), so this is opt-in configuration that moves no data. The
actual physical data migration to per-product tables stays **opt-in and
documented** (`docs/supabase.md#per-product-table-namespaces`) — run it with
review + a backfill/rollback plan when a product actually needs its own
namespace, per the strategy's *don't over-split a pre-MVP* caution.

## Seam A — Orchestrator service boundaries — DONE

> Completed as described below (recorder → contracts → diagnostics → exam-prep),
> minus the grading core which was intentionally retained. Kept for the record.

### Assessment

`assay_api/orchestrator.py::RunOrchestrator` is **already decomposed into stage
methods**: `_qualify` → `_resolve_pack` → `_load_prior_diagnostics` →
`_run_items` (→ `_ask_candidate`, `_grade`) → `_assemble_scorecard` →
`_record_lesson_outcomes` / `_persist_new_lessons`. The logical separation the
strategy asked for already exists at the method level.

What's *not* separated is the shared mutable state those methods rely on:
`_sequence`, `_trace_step_id`, `_trace_steps`, `_judge_cache`, and the `_event`
emitter. A true service split has to make that state an explicit dependency.

### Staged plan (when greenlit)

1. **Extract `RunRecorder`** (lowest risk, do first). Move `_event`,
   `_record_reasoning_step`, `_record_tool_step`, `_reasoning_content`,
   `_tool_content`, `_step_tokens`, `_STEP_CONTENT_CAP`, and the `_sequence` /
   `_trace_step_id` / `_trace_steps` state into a `RunRecorder` the orchestrator
   owns (`self._recorder`). Expose `event(...)`, `record_reasoning_step(...)`,
   `record_tool_step(...)`, and a `trace_steps` property. Pure move; behavior
   preserved. Covered by `test_demo_run_completes_with_scorecard`,
   `test_learning_loop`, `test_orchestrator_concurrency`.
2. **Define stage contracts.** Give each stage an explicit
   input→output dataclass (e.g. `QualifyResult`, `PackResolution`,
   `RunItemsResult`) so a stage can be called in isolation and unit-tested
   without driving a whole run.
3. **Promote stages to callable services.** Move qualification, pack
   resolution, item execution, scoring assembly, and the lesson loop into their
   own modules that take `(run, candidate, recorder, ...)` and return their
   result type. `RunOrchestrator.start()` becomes thin glue that calls them.

### Acceptance

- Every stage is independently unit-testable with a fake `RunRecorder`.
- All existing run/learning-loop/concurrency tests pass unchanged.
- `start()` reads as a sequence of named service calls, no inline stage logic.

## Seam B — Per-product table prefixes — CONFIG DONE (data migration opt-in)

> The resolver + per-product prefix overrides are shipped and tested. Only the
> live data migration remains opt-in; the staged plan below is the runbook for it.

### Assessment

`SupabaseStore` already uses `assay_*` tables (`DEFAULT_TABLES`) with a
`LEGACY_TABLES` (`interviu_*`) back-compat fallback selected by
`ASSAY_SUPABASE_TABLE_PREFIX` or auto-detection. The five tables
(candidates, runs, events, scorecards, lessons) are shared across all products.

Giving products their *own* table namespace means new tables + a migration +
extending the prefix-detection logic, and a data move for any existing
deployment. That is a live-data change and must not run unattended.

### Staged plan (when greenlit)

1. Decide the partition: which product owns which table(s). Likely
   runs/events/scorecards stay together (one run pipeline); candidates and
   lessons could move to an agents/diagnostics namespace.
2. Add a forward migration creating the new-namespace tables and back-filling
   from the shared ones; keep the old tables readable during transition.
3. Extend `DataStore` table resolution to map each logical table to its
   product namespace, preserving the existing auto-detect/back-compat path.
4. Verify with `verify_database` against both a fresh and a legacy schema.

### Acceptance

- A fresh project provisions per-product tables; a legacy project still reads.
- `GET /health/database` reports the resolved namespace per logical table.
- No data loss path; the migration is reversible.

## Recommendation

Both seams' code is shipped: Seam A (recorder, contracts, diagnostics, exam-prep,
grading core retained) and Seam B's config layer (per-product table resolver +
prefix overrides, defaults unchanged). The only remaining step is the **opt-in
live data migration** for Seam B — run it with review and a backfill/rollback
plan when a product actually needs its own namespace, not before. Part B is
otherwise complete.
