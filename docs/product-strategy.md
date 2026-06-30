# Assay Product Strategy — Make Each Product Run As Its Own Thing

> Research + improvement plan. The brief: *"each product should be its own thing,
> right now it's clumped with the rest, and I can't even see the other files like
> the UI front-end."*

## 0. Two things to clear up first

1. **There is no "Clumo."** A case-insensitive search of the whole repo returns
   nothing. The word in the brief means **clumped** — everything is fused into
   one product. That instinct is correct; this doc maps the clump and how to
   un-clump it.
2. **The UI front-end is not missing.** It is the entire **`apps/web/`** Next.js
   app — `apps/web/src/app/` holds the pages and `apps/web/src/components/` holds
   the UI. It was hard to "see" because this is a **two-app monorepo**: the Python
   API (`apps/api/`) and the web UI (`apps/web/`) are *siblings*, not nested. So
   when you look at the API you never see the UI, and vice-versa.

**Where we actually are:** Assay is a single monolith (still mid-rename from its
old name *Interviu* — see `supabase/migrations/20260629010000_rename_interviu_to_assay.sql`)
that bundles ~7 capabilities. They are welded together through **one database,
one models file, one API file, one run-orchestrator, and one frontend cache.**
"Each product runs as its own thing" = cut those welds so each capability can
boot, ship, and improve on its own.

---

## Part A — The Product Map (every file, so you can finally see each product)

The repo top level:

```
Assay/
├── apps/
│   ├── api/        # Python FastAPI backend
│   │   └── assay_api/      # all backend modules
│   └── web/        # Next.js front-end  ←  the UI you couldn't see
│       └── src/
│           ├── app/         # pages (routes)
│           ├── components/  # UI, grouped by concern
│           ├── lib/         # API client, query cache, hooks
│           └── types/       # shared TS types
├── supabase/migrations/     # DB schema
├── docs/                    # research + this file
└── proposals/               # larger design notes
```

The 7 capabilities and **exactly which files make up each one** — backend,
front-end UI, DB tables, and API routes:

### 1. Exam Engine — intake + adversarial run (the core flow)
- **Backend:** `apps/api/assay_api/orchestrator.py`, `exam_synthesis.py`,
  `scoring.py`, `agent_intake.py`, `tool_parser.py`, `adapters/` (`base.py`,
  `factory.py`, `http.py`, `mock.py`, `prompt.py`)
- **Front-end:** `apps/web/src/app/page.tsx`, `components/assay/*`
  (`AgentIntake.tsx`, `Landing.tsx`, `JudgingWaterfall.tsx`, `VerdictPanel.tsx`,
  `ImprovePanel.tsx`, `HeroScanCard.tsx`, `RoleBriefCard.tsx`,
  `AgentRunControls.tsx`, `SampleReportCard.tsx`), `lib/useRunStream.ts`,
  `lib/useAgentRun.ts`, `components/run/RunStateMachine.tsx`
- **DB tables:** `assay_runs`, `assay_events`
- **Routes:** `/` · `POST /candidates/from-markdown` · `POST /runs` ·
  `POST /runs/{id}/start` · `GET /runs/{id}/events`

### 2. Suites — exam packs
- **Backend:** `apps/api/assay_api/exam_packs.py`, `exports.py`
- **Front-end:** `apps/web/src/app/suites/page.tsx`
- **DB:** packs are code-defined + imported (no dedicated end-user table yet)
- **Routes:** `/suites` · `GET/POST /exam-packs*` · `/exam-packs/{id}/export*`

### 3. Agents registry & run history
- **Backend:** `apps/api/assay_api/database.py`, `progress.py`
- **Front-end:** `apps/web/src/app/agents/page.tsx`,
  `app/agents/[candidateId]/AgentHome.tsx`, `app/runs/page.tsx`,
  `app/runs/[runId]/RunDetail.tsx`, `components/scorecard/*`
  (`CompetencyRadar.tsx`, `RunComparison.tsx`)
- **DB tables:** `assay_candidates`, `assay_runs`, `assay_scorecards`
- **Routes:** `/agents` · `/agents/{id}` · `/runs` · `/runs/{id}` ·
  `/runs/{id}/scorecard` · `/runs/{id}/comparison`

### 4. Role Intelligence — job scope → competencies
- **Backend:** `apps/api/assay_api/role_intelligence.py`, `role_qualification.py`
- **Front-end:** no standalone screen — surfaces inside the run and the proof
  bundle (`RoleBriefCard.tsx`)
- **Routes:** `POST /role-analysis` · `GET /runs/{id}/role-analysis` ·
  `GET /runs/{id}/role-brief`

### 5. Agent Refinery — run → refined `AGENTS.md` + sub-agents
- **Backend:** `apps/api/assay_api/agent_refinery.py`, `agent_research.py`
- **Front-end:** rendered in the trace drawer / refinery panel
  (`components/trace/TraceDrawer.tsx`)
- **Routes:** `GET /runs/{id}/agent-spec` ·
  `POST /runs/{id}/agent-spec/export-files` ·
  `POST /runs/{id}/agent-spec/research`

### 6. Trace Audit — TraceRazor
- **Backend:** `apps/api/assay_api/trace_audit.py` (+ the sibling `tracerazor`
  Python package, installed separately)
- **Front-end:** `apps/web/src/components/trace/*` (`TraceDrawer.tsx`,
  `SpanTree.tsx`, `SpanDetail.tsx`, `spanMeta.ts`)
- **Routes:** `GET /runs/{id}/trace`

### 7. Diagnostic Library — the learning loop
- **Backend:** `apps/api/assay_api/progress.py`, lessons persistence in
  `database.py`
- **Front-end:** `apps/web/src/components/library/DiagnosticLibrary.tsx`,
  `components/progress/ProgressTrend.tsx`
- **DB tables:** `assay_lessons`
- **Routes:** `/runs/{id}/lessons-applied` · `/candidates/{id}/progress` ·
  `/candidates/{id}/lessons`

### The shared spine (this is the clump)

Everything above is welded to five shared things. **This is what makes "each
product its own thing" hard:**

| Weld | File(s) | Why it clumps |
|------|---------|---------------|
| One type set | `apps/api/assay_api/models.py`, `apps/web/src/types/assay.ts` | Every product imports the same `models.py`; a change for one ripples to all. |
| One datastore, 5 tables | `apps/api/assay_api/database.py` | candidates / runs / events / scorecards / lessons are shared by all 7 — no product owns its data. |
| One API file | `apps/api/assay_api/main.py` (~50 routes) | All endpoints live in one module; no product boundary. |
| One orchestrator | `apps/api/assay_api/orchestrator.py` (`RunOrchestrator.start()`) | Role intelligence → exam synthesis → scoring → lessons → adapters all run *inside* one method. |
| One frontend cache | `apps/web/src/lib/api.ts`, `lib/queries.ts` | A single `assayApi` client + one query-key registry whose invalidations cross-pollinate every surface. |

---

## Part B — "Each Runs As Its Own Thing": the separation blueprint

Ranked easy → hard so you get wins early. The goal of each step is the same: a
piece that can **boot and be demoed without the rest**.

### Tier 1 — already near-standalone (extract into shared packages first)
These have clean contracts today; lift them into a `packages/` area that the
products *import*:
- **Adapters** (`adapters/`) — already a clean `ask(context, question)` protocol.
- **DataStore** (`database.py`) — SQLite/Supabase already behind one interface.
- **Design system** (`apps/web/src/components/ui/*`) — framework-agnostic.
- **Trace viewer** (`components/trace/*`) — only needs span data + metadata.

### Tier 2 — medium (own module + own data namespace)
Each already has a focused file and a deterministic, offline contract. Give each
its **own request/response models** (split out of the shared `models.py`) and its
**own table prefix** instead of sharing the 5 tables:
- **Suites** (`exam_packs.py`)
- **Role Intelligence** (`role_intelligence.py`)
- **Agent Refinery** (`agent_refinery.py`)

### Tier 3 — hard (the true clump: the orchestrator)
`RunOrchestrator.start()` *contains* role intelligence, exam synthesis, scoring,
the lesson library, and adapters. To separate, each must become a **service with
an explicit input/output contract the orchestrator calls** rather than embeds:
```
qualify(scope)        -> role brief
resolve_pack(brief)   -> exam pack
run_items(pack, adp)  -> raw results
score(results)        -> scorecard
record_lessons(...)   -> lessons
```
Once those five calls are real boundaries, the orchestrator becomes thin glue and
each engine is independently testable and runnable.

### The four seams to cut
1. **Models:** split the one `models.py` / `types/assay.ts` into per-product model
   modules + a small shared core (ids, enums, the candidate/run envelope).
2. **API:** break `main.py` into FastAPI **sub-routers** (`runs`, `suites`,
   `agents`, `role`, `refinery`, `trace`) mounted on the app — the single biggest
   readability/declumping win.
3. **Data:** give products that own data their own table prefix so a product's
   storage can move without touching the others.
4. **Frontend cache:** split `queries.ts` into per-product query-key namespaces so
   invalidations stop cross-pollinating.

### Recommended target shape (and the trade-off)
**Keep the monorepo.** Reorganize into:
```
packages/   # shared: adapters, datastore, ui, trace
products/   # exam-engine, suites, agents, role-intel, refinery, diagnostics
            #   each with its own models, router, and frontend route group
```
Any one product can then boot and be demoed/sold without the others — while the
shared packages keep you from rewriting plumbing per product.

> **Trade-off / caution:** don't over-split a pre-MVP. Splitting into separate
> *deploys* (separate servers, separate repos) too early multiplies ops work and
> slows you down. The right move now is **module boundaries inside the monorepo**;
> promote a product to its own deploy only when it earns its own customer.

---

## Part C — Per-Product Refinement ("if I'm the user, what I'd want")

Each tied to a real gap in the code/docs today.

| Product | As a user, I'd want… | Why (gap today) |
|---------|----------------------|-----------------|
| **Exam Engine** | exams for *my* domain (support, coding, data-access), and each probe to stream a plain-English "why it failed," not just spans | packs are HR-only (`hr-v1`, `hr-injection-v1`); see `proposals/exam-pack-expansion.md` |
| **Suites** | to build / clone / share a pack from the UI | Hugging Face export exists, but there's no authoring UX — `suites/page.tsx` is list + import only |
| **Agents registry** | one "agent home" with trend, last verdict, and one-click "re-test the improved version" | `AgentHome.tsx` exists; the iterate loop is half-built (`ImprovePanel.tsx`) |
| **Role Intelligence** | to paste a role and watch the exam auto-build *before* I run, with the reasoning shown | the evidence chain already exists in `role_intelligence.py` — it just isn't surfaced as its own screen |
| **Agent Refinery** | the refined `AGENTS.md` as a **diff** against what I uploaded | refinery emits a fresh file; no before/after comparison |
| **Trace Audit** | it to degrade gracefully and tell me *what to fix*, not just a TAS number | `trace_audit.py` returns a score + status; fixes live in TraceRazor's `report.fixes` but aren't foregrounded |
| **Diagnostic Library** | proof the agent is actually improving — "lessons applied" carried across runs | loop exists in `progress.py`; make it the headline of the agent home |

---

## Part D — Overall Product Improvements (one ranked roadmap)

Consolidates the scattered notes (`improvement.md`, `docs/*-research.md`,
`proposals/*`) so the strategy lives in one place.

1. **Split `main.py` into routers.** Highest-leverage declumping move; unblocks
   per-product boundaries and makes the API readable. *(Tier-1 effort.)*
2. **Finish the Interviu → Assay rename.** The half-done rename (DB tables, sprite
   sheets, `assay_api` module name) is the exact confusion the brief hit. Pick a
   name and finish it. *(Mechanical, high clarity payoff.)*
3. **Pick and commit to the north-star.** The README's "pre-deployment litmus
   test for agents" is the sharpest framing. Lean into **CI gating**
   (`proposals/assay-cli-github-action.md`) — that's what makes the product sticky
   vs. a one-off local tool.
4. **Broaden exam packs beyond HR** (`proposals/exam-pack-expansion.md`) so the
   Exam Engine serves more than one audience.
5. **Unify loading / empty-state UX** (already flagged in `improvement.md` R3) so
   every product surface feels like one polished app.
6. **Then** execute the Part-B module split, product by product, starting with the
   Tier-1 extractions.

### Suggested sequencing
- **Now (declump + clarify):** items 1, 2, 5.
- **Next (sharpen the wedge):** items 3, 4.
- **Then (separate for real):** Part B, Tier 1 → Tier 2 → Tier 3.

---

## Appendix — source notes referenced
`README.md` · `improvement.md` · `docs/product-research.md` ·
`docs/ux-research.md` · `docs/backend-surfaces.md` · `docs/connectors.md` ·
`docs/agent-refinery.md` · `docs/role-intelligence.md` · `proposals/*.md`
</content>
