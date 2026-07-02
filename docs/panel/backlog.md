# Assay — Ranked Improvement Backlog

> Synthesized by the panel lead from six adversarially-verified evaluator lenses
> (functionality-qa, ux-critic, aesthetic-critic, logic-reviewer, marketer-positioning,
> marketer-growth). Findings are deduped, merged where lenses agree, and ranked by
> severity then impact/effort. Every item cites file:line evidence and a verify step.

## Executive summary

Assay's engine is sound enough to demo, but the panel converges on one uncomfortable theme:
**the certification the product sells is partly theater, and the parts that aren't theater are
hard to see, hard to trust, and hard to share.** The two P0s cut to the core promise — pass^k
is vacuous because all k trials are byte-identical resamples (logic-reviewer), and the repo
ships with no LICENSE so nobody can legally adopt it anyway (marketer-growth). Below that sits a
cluster of P1 honesty-and-legibility defects that multiple lenses independently flagged: the
scoring gate awards gameable length/keyword bonuses, the auto-refined AGENTS.md hardcodes an HR
identity for every agent, the verdict lexicon says three different words on three screens, the
"tailored exam" thesis is dead behind an unset env flag, demo mode ambushes the user after a
20-second wait, and there is no shareable proof artifact. The P2/P3 tail is mostly dead-but-wired
surfaces (connectors, research drawer, file exports, drawer enum), warm-bone theming drift, and
positioning copy that undersells the one thing Assay owns — zero instrumentation. Fix the two P0s
and the P1 honesty cluster and Assay goes from "impressive demo with a credibility seam" to "a
gate a team can actually rely on and pass around."

## Count table

| Severity | Count |
|----------|-------|
| P0       | 2     |
| P1       | 8     |
| P2       | 17    |
| P3       | 12    |
| **Total**| **39**|

---

## P0 — certification is broken or legally unusable

### [P0-1] pass^k is vacuous — k identical resamples  `scoring` · effort:L · lenses: logic-reviewer
**Problem:** The candidate answer is a pure function of the question, so all k trials of a variant are byte-identical and pass^k collapses to pass^1 repeated k times. The mock adapter keys its answer on (config.id, question); the live PromptAgentAdapter sets no temperature, no per-trial seed, and never receives the trial index — `orchestrator.evaluate()` sends the same question every trial.
**Why:** pass^k is the *headline certification claim* ("every held-out trial must clear the bar"), sold as evidence of reliability under repeated sampling. If k=3 measures exactly what k=1 measures, the certification is theater and users over-trust a "passed pass^3" verdict — the single most load-bearing number in the product.
**Fix:** Either (a) inject real per-trial variance — thread the trial index into `ask()`, set a nonzero temperature + per-trial seed on the live path, add paraphrase/jitter on the mock path, then report the *actual* per-trial pass fraction; or (b) if runs are deterministic by design, drop the k dimension and the pass^k language entirely and call it a single held-out check. Do not advertise pass^k over identical resamples.
**Evidence:** `apps/api/assay_api/orchestrator.py:227-241` (trial threaded to `_ask_candidate` but the same `item.prompt`/`held_out_prompt` is reused every trial); `apps/api/assay_api/adapters/mock.py:16`; `apps/api/assay_api/adapters/prompt.py:135-141`; `apps/api/assay_api/models/run.py:81`
**Verify:** Run k=3 on any agent and diff the three per-trial responses for one variant — they must differ. Confirm the reported pass fraction can land strictly between 0 and 1 (e.g. 2/3), not only 0/3 or 3/3.

### [P0-2] No LICENSE / CONTRIBUTING / SECURITY at repo root  `oss` · effort:S · lenses: marketer-growth
**Problem:** The only LICENSE files in the tree are inside `node_modules`. There is no root LICENSE, CONTRIBUTING, or SECURITY file.
**Why:** With no license the code is legally "all rights reserved" — no team can adopt it, no one can fork it, GitHub shows no license chip, and the entire OSS-first growth motion is dead on arrival. Every reference competitor (Promptfoo MIT, Giskard Apache 2.0) drove adoption via an explicit permissive license. A *security* tool with no vuln-disclosure policy is an additional credibility own-goal.
**Fix:** Add an MIT `LICENSE` at repo root (matches Promptfoo, lowest adoption friction), a short `CONTRIBUTING.md`, and a `SECURITY.md`. Surface the license chip/badge in the README.
**Evidence:** Root glob `LICENSE*` returns matches only under `node_modules/*`; no root `CONTRIBUTING*`/`SECURITY*`.
**Verify:** `ls` at repo root shows LICENSE, CONTRIBUTING.md, SECURITY.md; GitHub renders a license chip on the repo header.

---

## P1 — honesty, legibility, and top-of-funnel defects

### [P1-1] Gameable length/keyword bonuses can force a false pass  `scoring` · effort:S · lenses: logic-reviewer
**Problem:** `grade_response` adds +0.08 for any answer ≥180 chars and +0.04 if the answer merely contains "privacy" or "protected", folded directly into the gated score — independent of whether the rubric checks were met.
**Why:** An agent can clear a 0.80 threshold on a compliance probe by padding length and dropping the word "privacy", without demonstrating the actual guardrail. This is a false-pass path in the exact gate Assay certifies on — and it directly amplifies the P0-1 problem (a gameable score over identical resamples is doubly hollow).
**Fix:** Remove the length and keyword bonuses from the gated score, or route them to a separate non-gating "presentation" signal. SHIP/FAIL scores must come only from rubric-check satisfaction and forbidden-phrase penalties.
**Evidence:** `apps/api/assay_api/scoring.py:83-86` (`structure_bonus`/`privacy_bonus` added into the returned score at line 86).
**Verify:** Grade a 200-char answer that satisfies zero rubric checks but says "privacy" — its score must be ≤ the forbidden-penalty floor, not lifted by +0.12.

### [P1-2] Verdict lexicon differs on every surface  `brand` · effort:S · lenses: marketer-positioning, ux-critic, logic-reviewer
**Problem:** The one opinionated call Assay makes is spelled three different ways: README says FAIL/RISKY/SHIP, Landing says "ship / risky / hold", SampleReportCard shows a "Ship with fixes" band, the runs table says "Needs review", run-detail says "Do not ship", and DeployabilityMeter uses "probation". A user moving home → runs list → run-detail sees three labels for one outcome. *(Three lenses independently flagged this — high confidence.)*
**Why:** The opinionated verdict IS the category wedge; nobody else makes the ship/don't-ship call. If the words drift screen to screen, "we decide for you" collapses into unfinished copy and the certification loses credibility.
**Fix:** Pick one canonical three-band lexicon (recommend HOLD / RISKY / SHIP, verb-first) and one noun for a graded run. Centralize the label mapping in a single constants module (`lib/assay` or `lib/derive`) and reference it from README, Landing STEPS+FIXES, SampleReportCard, VerdictPanel, the runs table, and DeployabilityMeter so bands can't diverge again.
**Evidence:** `README.md:23`; `apps/web/src/components/assay/Landing.tsx:49`; `apps/web/src/components/assay/SampleReportCard.tsx:28-31`; `apps/web/src/app/runs/page.tsx:96-100`; `apps/web/src/app/runs/[runId]/RunDetail.tsx:86`; `DeployabilityMeter` tone `probation` at :215; `assay.ts:78`
**Verify:** Grep the web + README for the band words — every user-facing occurrence resolves through one constant. One run reads identically on home, runs list, and run-detail.

### [P1-3] Demo mode ambushes the user after the run, not before  `intake` · effort:S · lenses: ux-critic, marketer-growth
**Problem:** With no OpenAI key the primary button still reads "Run the litmus test"; the only signal is a small muted "Demo mode" chip. The "Demo result" banner appears only *after* the ~20s run. A stranger pastes a real agent.md, waits through the judging animation expecting real evaluation, and learns at the verdict it was graded with deterministic stand-ins.
**Why:** Expectation-setting is too quiet and too late; the first-run aha turns into a bait-and-switch at the exact moment trust is being decided.
**Fix:** When `liveMode` is false, change the button copy to "Run demo litmus test", show an inline notice above the button ("No OpenAI key detected — this runs a deterministic demo, not your real agent"), and carry the demo framing into the JudgingWaterfall heading so the state is honest end-to-end.
**Evidence:** `apps/web/src/components/assay/AgentIntake.tsx:161-190` (fixed button label, chip is the only signal); `apps/web/src/components/assay/VerdictPanel.tsx:62-71` (banner only after run).
**Verify:** With no key set, the button says "Run demo…" and the inline notice is visible *before* clicking; the waterfall heading names demo mode.

### [P1-4] No zero-input demo path on the hero  `intake` · effort:S · lenses: marketer-growth
**Problem:** The run button is disabled until the visitor pastes or uploads content; templates require a manual click. The one-click demo exists only in the workspace `EmptyState`, not on the page everyone lands on.
**Why:** The 60-second aha is the top of the funnel. A first-time visitor with no agent.md handy hits a disabled button instead of instantly watching a run stream to a verdict.
**Fix:** Add a prominent "Run the sample agent" button on the hero that loads the `hr-minimal` template and starts a run in one click, so a visitor sees the full intake → judging → verdict flow with zero input.
**Evidence:** `apps/web/src/components/assay/AgentIntake.tsx:165` (`disabled={!hasContent || submitting}`); one-click demo lives only in `EmptyState.tsx:139`; no sample-run CTA in `page.tsx` intake phase.
**Verify:** Land on `/` with an empty editor; a single visible CTA runs a full sample flow to a verdict without any typing.

### [P1-5] Tailored-exam thesis is dead by default  `verdict` · effort:M · lenses: functionality-qa
**Problem:** `qualify()` returns `None` unless `ASSAY_TAILORED_EXAMS_ENABLED` is set, and that env flag is set nowhere in the repo (only read). So the "we research what your agent should be, then hold it to that" stage never runs for a first-time user.
**Why:** The product's headline thesis is invisible: RoleBriefCard ("What we held it to") renders nothing, JudgingWaterfall never shows "Judge qualified / Built N tailored probes", the Experiments "Tailored" tag never appears, and the RunDetail "Role research" step is permanently a warn. The verdict reads like the black box the marketing explicitly promises it is not.
**Fix:** Default the flag on with graceful degrade when no OpenAI key, *or* ship a documented `.env.example` that enables it, *or* have `qualify()` emit a lightweight deterministic `role_qualified` event so RoleBriefCard/waterfall/timeline show something grounded instead of silently nothing.
**Evidence:** `apps/api/assay_api/exam_prep.py:16-18,40-46` (flag gate); flag set nowhere in repo; consumed at `apps/web/src/components/assay/RoleBriefCard.tsx:34`, `JudgingWaterfall.tsx:103-127`, `runs/[runId]/RunDetail.tsx:329`.
**Verify:** A fresh run (no manual env setup) populates RoleBriefCard and shows a "tailored"/"qualified" step in the waterfall and timeline.

### [P1-6] Auto-refined AGENTS.md hardcodes an HR identity for every agent  `refinery` · effort:M · lenses: logic-reviewer
**Problem:** `_render_agent_markdown` always writes `Role: "HR screening agent. Evaluate candidates with lawful, job-related criteria"` and guardrails about "protected attributes" and "candidate ranking", regardless of the submitted agent. Submit a coding agent that fails `secret_handling` and the refined spec tells it to stop ranking candidates on protected attributes.
**Why:** The refined AGENTS.md is the core deliverable, and Assay's pitch is BYO-agent (coding/support/HR). Advice that is not just useless but actively wrong for the role torpedoes credibility precisely where the product is supposed to add value.
**Fix:** Derive the Role line and guardrails from the candidate's own title/role and the pack's competencies. At minimum branch on pack id (hr vs support vs coding) and pull guardrail text from the failing competencies' rubrics.
**Evidence:** `apps/api/assay_api/agent_refinery.py:504` (fixed "HR screening agent…"); `apps/api/assay_api/agent_refinery.py:555-559` (hardcoded protected-attribute/candidate-ranking guardrails).
**Verify:** Refine a coding agent; the output Role/Guardrails reference coding/secret-handling, contain no "candidate"/"protected attribute" HR text.

### [P1-7] Verdict screen isn't legible in 5 seconds  `verdict` · effort:M · lenses: ux-critic
**Problem:** Below the hero the verdict stacks RunComparison, RoleBriefCard, the full ImprovePanel (gaps/strengths/trace-fixes/sub-agents/diff/full-md), *then* the "What to fix" list, then a by-capability grid, then an evidence link. The one thing the developer came for — the ranked fixes — sits 4th, buried under the biggest block on the page.
**Why:** The stated design goal is "one verdict, one score, one biggest-problem sentence… then the ranked what-to-fix list." Rendering ImprovePanel before "What to fix" pushes the primary payoff far down and destroys the glance value the screen was redesigned to deliver.
**Fix:** Reorder VerdictPanel so "What to fix" renders immediately after the hero/meter/actions and before ImprovePanel/RoleBriefCard. Collapse ImprovePanel and RoleBriefCard behind one "How to improve" disclosure, closed by default. Keep the 5-second path: verdict → score → biggest problem → top 3 fixes.
**Evidence:** `apps/web/src/components/assay/VerdictPanel.tsx:135-189` (RunComparison, RoleBriefCard, ImprovePanel all render before the `.assay-fixes` block at line 150).
**Verify:** On any verdict, the top-3 fixes are visible above the fold without scrolling past the improve/coaching panel.

### [P1-8] No shareable proof artifact  `proof` · effort:L · lenses: marketer-growth
**Problem:** The only shareable output of a run is a local JSON proof-bundle download. There is no hosted run permalink, no embeddable status badge, and no shareable verdict image. The pass^k proof story is described in mechanics with no artifact anyone else can open.
**Why:** Growth needs artifacts that travel. A JSON file no one else can open doesn't spread; a badge in a README or a verdict card in a PR does. Competitors get pull from public results — Assay currently generates zero shareable social proof, and "certification" is only worth the word if it produces something portable.
**Fix:** Ship (a) an embeddable Markdown/SVG badge ("Assay: SHIP — pass^3 held-out") keyed to the agent.md hash, (b) a single verdict-card PNG export for PRs/READMEs, and (c) a portable/hosted run link viewable without the local DB. The proof bundle already exists — surface it as an external trust signal.
**Evidence:** `apps/web/src/app/runs/[runId]/RunDetail.tsx:122` (`downloadJson` "Export proof" is the only export); no share/permalink/badge feature in `apps/web/src`; `README.md:26-28` (proof bundle is JSON-only).
**Verify:** From a completed run, generate a badge + PNG + link; open the link in a fresh browser session with no local DB and see the verdict.

---

## P2 — dead surfaces, trust seams, and load/theming defects

### [P2-1] README under-converts — no badges, CI wedge buried, static PNGs  `readme` · effort:M · lenses: marketer-growth
**Problem:** The README has zero badges, buries the CI-gate wedge below six sections (its 7th H2), and uses static PNG screenshots with no animated run or hosted try-it link.
**Why:** The README is the primary conversion asset for a dev tool. Leading with prose instead of the `assay run` one-liner + PR-comment proof, with no badges or motion, converts far worse than the Promptfoo-style top-of-fold.
**Fix:** Restructure the top-of-fold: hero GIF of a run to verdict, shields.io badges (CI/license/PyPI), the `assay run --agent-md` one-liner, and the PR-comment screenshot — all above the fold. Move install/manual commands down.
**Evidence:** `README.md` has 0 shields/badge occurrences; "Run Assay in CI" starts at `README.md:123`; screenshots at lines 40/46/54/61 are static PNGs.
**Verify:** README first screenful shows badges + one-liner + a run GIF; CI-gate section is within the first two H2s.

### [P2-2] Verdict action row has five competing CTAs, no primary  `verdict` · effort:M · lenses: ux-critic
**Problem:** "Rerun same agent", "Test improved version", "Open in workspace", "Open full trace", and "Test a different agent" sit in one flat row with no primary; "Open in workspace" and "Open full trace" lead to overlapping trace/analytics destinations.
**Why:** A stranger who just got a FAIL has no signposted next step; five equal-weight buttons force a decision the UI should make, and two are near-duplicates that dilute the choice.
**Fix:** Pick one primary CTA driven by verdict state (FAIL/RISKY → "Test improved version" when a refined md exists, else "Rerun"; SHIP → "Open in workspace"). Demote the rest to a quiet secondary row or overflow, and merge "Open in workspace" + "Open full trace" into one "Open full run".
**Evidence:** `apps/web/src/components/assay/VerdictPanel.tsx:115-133`.
**Verify:** Each verdict state renders exactly one visually-primary CTA; workspace/trace collapse to a single entry.

### [P2-3] Deploy-gate config buried in a collapsed disclosure  `intake` · effort:M · lenses: ux-critic
**Problem:** Role scope, strict/advisory policy, and the pass-bar slider are hidden inside a collapsed `<details>Role scope & deploy policy</details>` most users never open — yet these inputs materially change the verdict (strict blocks on trace/degraded findings; the slider sets the competency threshold).
**Why:** The verdict later prominently states "Judged against: …" and draws a threshold tick, but the user was never meaningfully invited to set that bar. Burying the gate that determines FAIL vs SHIP undercuts the honesty the redesign was going for.
**Fix:** Surface the strict/advisory toggle and pass-bar value inline (a compact "Deploy gate: Strict · 80%" control with an edit affordance) so the user sees and owns the bar before running; keep role-scope text in the disclosure.
**Evidence:** `apps/web/src/components/assay/AgentIntake.tsx:192-243`.
**Verify:** On intake, the strict/advisory + pass-bar value are visible without expanding the disclosure and match "Judged against" on the verdict.

### [P2-4] Two parallel verdict systems can disagree  `verdict` · effort:M · lenses: logic-reviewer
**Problem:** `scorecard.certified` (orchestrator's own failure list) and the deployability decision (recomputes ship/probation/do_not_ship with critical-findings + degraded checks + policy) are separate sources of truth. `deriveVerdict` prefers the decision but falls back to `certified+tracePasses`, so one run can read "certified" in one place and "do not ship" in another.
**Why:** Redundant sources of truth invite exactly the honesty bugs the recent work tried to kill; a degraded run can be certified=true while the decision blocks.
**Fix:** Make the deployability decision the single verdict authority; derive `scorecard.certified` from it (or drop the boolean and store the decision verdict on the scorecard). Every surface reads one field.
**Evidence:** `apps/api/assay_api/orchestrator.py:341-353`; `apps/api/assay_api/deployability.py:207-241`; `apps/web/src/lib/assay.ts:80-84`.
**Verify:** Construct a degraded run; certified and decision cannot disagree on any surface.

### [P2-5] Critical-finding gate is a brittle substring scan  `deployability` · effort:M · lenses: logic-reviewer
**Problem:** `_critical_findings` lowercases each English `failure_reason` and scans for "leak/secret/exfiltrat/protected". But reasons are prose like "compliance failed pass^3 on held-out variants" — none contain the markers even for a real canary leak — while a benign competency named "protected_attribute_fairness" could false-positive. The `critical_findings_allowed=0` gate keys off prose, not structured findings.
**Why:** This is supposed to be the hardest safety line, and it both misses real criticals and can trip on benign text.
**Fix:** Emit structured findings with explicit severity/category from the grader (forbidden-hit type, canary leak, protected-attribute use) and gate on those flags, not substring-matching human-readable text.
**Evidence:** `apps/api/assay_api/deployability.py:14-26` (`_CRITICAL_MARKERS`), `:268-274` (substring scan); `orchestrator.py:342-351` (reasons are grade/gap prose).
**Verify:** A run with a real canary leak trips the gate even when the prose lacks the marker word; a passing "protected_*" competency does not trip it.

### [P2-6] Agent-research feature fully wired in the client, never invoked by UI  `trace-audit` · effort:M · lenses: functionality-qa
**Problem:** `assayApi.agentResearch`, `runRoleAnalysis`, and `roleAnalysis` have no callers; `page.tsx` declares `agentResearch`, resets it, passes it to TraceDrawer, but never sets it (`setAgentResearch` is dead). TraceDrawer's only research affordance (the "Research: {mode}" badge) can therefore never render.
**Why:** A first-time user is promised deep research that no button ever triggers — a surface implying a capability that isn't reachable.
**Fix:** Either wire a "Run deep research" action (POST /runs/{id}/agent-spec/research) into the trace drawer/verdict and populate `agentResearch`, or delete the dead state, the never-rendered badge, and the unused client methods.
**Evidence:** `apps/web/src/lib/api.ts:101-110`; `apps/web/src/app/page.tsx:57` (`setAgentResearch` never called), `:372` (passes always-null); `TraceDrawer.tsx:186-188`.
**Verify:** Either the research badge renders after a user action, or grep finds zero references to the removed methods/state/badge.

### [P2-7] Connectors rail — endpoints + hooks exist, no UI consumes them  `api` · effort:M · lenses: functionality-qa
**Problem:** `useConnectors`/`useConnectorProbes` are exported and GET `/connectors` + `/connectors/probe` exist, but no component renders connectors; the hooks are never called outside the proof-bundle blob.
**Why:** The advertised connectors surface doesn't exist for the user; the code gives a false impression the feature is present.
**Fix:** Either build the connectors rail that calls `useConnectorProbes` and renders probe pass/fail, or remove the dead hooks/exports and the `connector_probes` payload from the proof bundle.
**Evidence:** `apps/web/src/lib/queries/index.ts:12`; grep for Connector/rail in `apps/web/src` finds only api.ts/queries/types/css/Sprite — no rendered consumer.
**Verify:** Either a connectors component renders probe results, or grep finds no connector hooks/exports/payload.

### [P2-8] Boot / API-down state never surfaced on intake  `intake` · effort:S · lenses: functionality-qa
**Problem:** `page.tsx` state derives "error" only from the local error var or `runStream.status`, never from `healthQuery/candidatesQuery/examPacksQuery.isError`. If the API is unreachable at boot, state falls through to "idle" and the intake renders healthy (with the "Demo mode" badge because health is null) — the user discovers the backend is down only after pasting an agent.md and clicking Run.
**Why:** The wall should be visible before the user invests effort.
**Fix:** Fold `healthQuery.isError` (and the other boot queries) into the state machine, or render a dedicated "can't reach the Assay API" banner on intake when the health query has errored.
**Evidence:** `apps/web/src/app/page.tsx:88-94` (state ignores `*.isError`), `:179-189` (liveMode badge keys off `health?.openai_configured`, null when down).
**Verify:** Stop the API, load `/` — an explicit "can't reach the API" state shows before any input.

### [P2-9] Live-run recovery poller gives up at 180s while the run continues  `run-detail` · effort:M · lenses: functionality-qa
**Problem:** `recoverRunResult` uses a hard 180,000ms deadline. A default live run is k=3 × items × 2 OpenAI calls inside one `/start` request; on a free-tier ~3 RPM key a 10-item pack is ~60 calls / ~20 min. When `/start` drops, the poller times out at 3 min and setState → "failed" even though the orchestrator keeps running and will persist a completed scorecard. The `ASSAY_LIVE_K` cap that would shrink this is set nowhere and undocumented.
**Why:** The user sees "failed" while the run is still completing server-side.
**Fix:** Raise/relate the recovery deadline to expected run length (or poll until the run record leaves running/created rather than a fixed wall clock), and document/default `ASSAY_LIVE_K` for free-tier keys.
**Evidence:** `apps/web/src/lib/useRunStream.ts:115` (deadline = now + 180_000); `apps/api/assay_api/routers/runs.py:80-88` (`ASSAY_LIVE_K` read, set nowhere); `models/run.py:18` (k default 3).
**Verify:** A long free-tier live run that outlasts 3 min resolves to its real verdict, not "failed".

### [P2-10] Judging progress bar sized from the pre-tailoring pack  `run-detail` · effort:M · lenses: functionality-qa
**Problem:** `runStream.start` is called once with `itemCount` from the create-time pack. When tailored exams are enabled, `resolve_pack` repoints `run.exam_pack_id` to a per-run `gen-*` pack with a different item count during `/start`, but the frontend never re-reads it — so `totalExpected` (itemCount×k) over- or under-counts for exactly the runs the product most wants to showcase.
**Why:** The determinate progress bar and "x / total probes" label are wrong for tailored runs.
**Fix:** After the run record settles (or via the already-emitted `tailored_exam_generated` event), update `totalExpected` from the actual generated pack's item count.
**Evidence:** `apps/web/src/app/page.tsx:194-196`; `apps/api/assay_api/exam_prep.py:61-75`; `useRunStream.ts:239`.
**Verify:** A tailored run's "x / total" reaches exactly total at completion.
**Depends on:** P1-5 (only observable once tailored exams actually run).

### [P2-11] Run-detail drawer enum has two dead values  `run-detail` · effort:M · lenses: ux-critic
**Problem:** The drawer URL enum accepts `['trace','spec','research']` but only `'trace'` is written, and TraceDrawer renders an identical span view for all three. A stale `?drawer=spec`/`?drawer=research` opens the trace drawer with mismatched intent; the promised spec/research deep-links don't exist.
**Why:** The file's own doc comment advertises "the URL fully describes the view", but two of three states are dead — the "research drawer never populates" gap surfacing as a broken affordance.
**Fix:** Either implement spec/research as real tabs inside TraceDrawer (Trace | Refined spec | Research), or narrow the enum to `['trace']` and drop the unused values.
**Evidence:** `apps/web/src/app/runs/[runId]/RunDetail.tsx:56-59` vs `TraceDrawer.tsx:99-218`.
**Verify:** Every accepted `?drawer=` value renders a distinct, correct view, or only `trace` is accepted.

### [P2-12] Workspace overwhelms — ~9 heavy sections, no nav  `run-detail` · effort:L · lenses: ux-critic
**Problem:** `/runs/[id]` renders header + verdict strip + optional improvement banner + a 2-up cockpit + ReviewCouncil + full ImprovePanel + a 4-card learning grid — ~9 always-open heavy sections with no tabs, sticky nav, or anchors.
**Why:** A first-time viewer opening a shared run link faces a wall of analytics with no way to orient — the same "wall of panels" the verdict screen was redesigned to escape.
**Fix:** Introduce a light section rail/tabs (Verdict · Deployability · Improve · Analytics · Trace) with the verdict strip pinned, and lazy-mount the analytics grid below the fold. At minimum add a sticky sub-nav with in-page anchors.
**Evidence:** `apps/web/src/app/runs/[runId]/RunDetail.tsx:88-201`.
**Verify:** The page is scannable via a pinned nav; analytics mounts lazily on scroll/tab.

### [P2-13] Run-detail loads section-by-section with no skeletons  `run-detail` · effort:M · lenses: ux-critic
**Problem:** Only the bottom learning grid shows skeletons (`scorecardQuery.isLoading`); DeployabilityMeter, InterviewTimeline, ReviewCouncil, and ImprovePanel simply don't render until their slower queries (proofBundle ~8s, reviewers, deployability) resolve — so the page pops in section by section with no placeholders.
**Why:** A shared-link visitor sees a header, a gap, then sections appearing over several seconds; perceived performance and trust suffer, with no "assembling proof bundle…" cue.
**Fix:** Render skeletons for the cockpit, ReviewCouncil, and ImprovePanel while pending, and add an "Assembling proof bundle…" hint tied to `proofBundleQuery.isLoading`.
**Evidence:** `apps/web/src/app/runs/[runId]/RunDetail.tsx:146-170` vs `172-176`.
**Verify:** During load, every section shows a skeleton and the bundle hint; nothing renders as an empty gap.

### [P2-14] Failed-run recovery story fragments into three siblings  `intake` · effort:M · lenses: ux-critic
**Problem:** On a failed run, JudgingWaterfall shows a bare "The run hit an error" heading with no cause, the actual error renders in a separate `.assay-error` block below, and a "Back to start" button sits in yet another sibling — three disconnected pieces, and the failed waterfall offers no retry.
**Why:** When a live run dies (rate limit, backend error) the user must visually stitch three fragments together; the waterfall gives a dead end.
**Fix:** When status is failed/canceled, collapse the waterfall into an inline error card showing the message plus a primary "Try again" and secondary "Back to start" in one place; drop the separate error/retry siblings for this phase.
**Evidence:** `apps/web/src/app/page.tsx:330-363`; `JudgingWaterfall.tsx:56-65`.
**Verify:** A failed run shows one card with cause + retry + back, no scattered blocks.

### [P2-15] Interviu→Assay rename leaks "interview/candidate" into core copy + PR artifacts  `brand` · effort:M · lenses: logic-reviewer, marketer-growth
**Problem:** Scorecard/deployability summaries say "blocking interview findings", the refinery calls runs "interviews", harness has `InterviewLoop`/`InterviewRound`; and the PR-comment marker + uploaded artifact are named `assay-assay`. *(Two lenses agree — one on internal copy, one on the public PR artifact.)*
**Why:** For a non-HR agent the interview/candidate metaphor is confusing and signals an unfinished pivot; "assay-assay" on a PR comment reads as a broken build in front of a whole team — a first-impression tax on the most viral surface.
**Fix:** Vocabulary pass: "interview"→"exam/trial", "candidate"→"agent under test" in user-facing summaries (deployability, refinery headlines, product_review). Rename the comment marker to `<!-- assay-comment -->` and the artifact to `assay-proof` in action.yml. Keep internal metaphor if you must, but verdict strings must match the litmus framing.
**Evidence:** `deployability.py:241` ("blocking interview findings"); `agent_refinery.py:1`; `product_review.py:95`; `harness.py:57-75`; `.github/actions/assay/action.yml:132` (`name: assay-assay`), `:149` (`<!-- assay-assay-comment -->`).
**Verify:** Grep user-facing strings + action.yml for "interview"/"candidate"/"assay-assay" — none remain in output a user reads.

### [P2-16] Role→pack mapping + sub-agent templates are HR-only  `refinery` · effort:L · lenses: logic-reviewer
**Problem:** `_SUBAGENT_TEMPLATES` defines only the 8 HR competencies (everything else falls to a nameless `policy_lookup` default), and `role_intelligence._COMPETENCY_RULES` reference only `hr-v1`/`hr-injection-v1` with HR floor competencies — so any job scope, including "coding agent", always routes to `hr-v1`. Two of four shipped packs are unreachable from role qualification.
**Why:** The coding/support packs are dead weight, and non-HR agents get generic or wrong sub-agent advice (compounds P1-6).
**Fix:** Add competency rules + pack keywords for support and coding (or make pack selection data-driven from each pack's competencies), and add sub-agent templates for non-HR competencies. Until then, hide the unreachable packs.
**Evidence:** `agent_refinery.py:30-114`, `:116`; `role_intelligence.py:40-99`, `:119-122`.
**Verify:** A "coding agent" scope routes to the coding pack and yields coding-specific sub-agent recommendations.

### [P2-17] CTA color is off-palette magenta, not the plum token  `brand` · effort:S · lenses: aesthetic-critic
**Problem:** The primary `.assay-run-button` is colored by `--accent-grad` (plum #7c5470), but its drop shadows and the landing dark-band accents are hardcoded to a more saturated magenta (#d072a6 / rgba(158,61,116)) that no token produces.
**Why:** The single most important action glows in a color that exists nowhere else, so the button reads as pasted from another palette and the "one calm accent" promise breaks at the decision point.
**Fix:** Derive the CTA shadow from the accent token (`color-mix(in srgb, var(--color-accent) 60%, transparent)`) and replace the #d072a6 dark-band literals with `color-mix` on `--color-accent`.
**Evidence:** `globals.css:1988-2001`, `:3149-3161`, `:3441-3463`.
**Verify:** The CTA shadow and dark-band accents resolve to the plum token; no #d072a6 literal remains.

---

## P3 — polish, consistency, and positioning depth

### [P3-1] Headline score painted with a fade-to-transparent gradient  `verdict` · effort:S · lenses: aesthetic-critic
**Problem:** `.litmus-num` uses `-webkit-background-clip:text` over the `--litmus` gradient, which fades to near-transparent, so the right-hand digits of a 2-3 digit score render at very low contrast on the tinted verdict card and can fail AA.
**Why:** The score is the 2-second glance the whole product is built around; clipping a fading gradient onto 42px text makes the most load-bearing number the hardest thing to read.
**Fix:** Drop the gradient text fill; use solid `var(--color-fg)` (or the verdict status color) for the figure and reserve `--litmus` for the meter track only.
**Evidence:** `globals.css:2806-2812`, `:73`; `VerdictPanel.tsx:82`.
**Verify:** Every digit of a 3-digit score meets AA against all three hero backgrounds.

### [P3-2] Focus-visible ring is stale teal, not plum  `intake` · effort:S · lenses: aesthetic-critic
**Problem:** Global `:focus-visible` sets `outline:2px solid var(--teal)` + `box-shadow rgba(45,125,115,0.25)` (green-teal glow) even though `--teal` was repurposed to plum #7c5470, while the assay-shell ring correctly uses `--color-accent` — so keyboard users see two focus colors.
**Why:** Inconsistent focus color plus a leftover from the old teal identity is both a visual seam and an a11y smell.
**Fix:** Replace the glow with `color-mix(in srgb, var(--color-accent) 25%, transparent)` and keep the outline on `var(--color-accent)`.
**Evidence:** `globals.css:481-485` vs `:2742-2746`.
**Verify:** Tab through the app — every focus ring is one plum.

### [P3-3] Diff container tints the whole block green  `refinery` · effort:S · lenses: aesthetic-critic
**Problem:** `.assay-improve-diff` sets base `color:var(--color-pass)` (green) + green bg on the whole container, overriding only add/remove/context per line, so a mostly-context diff reads as a wall of green "additions".
**Why:** A diff whose unchanged lines look green defeats the before/after view and undermines trust in the refined AGENTS.md.
**Fix:** Make the container neutral (`--color-panel` bg, `--color-fg-muted` text); let only `.assay-diff-add` carry green and `.assay-diff-del` red.
**Evidence:** `globals.css:2495-2508` vs per-line `:4757-4760`.
**Verify:** A diff with mostly unchanged lines reads neutral; only added lines are green.

### [P3-4] Semantic status used as full-bleed background behind long text  `verdict` · effort:M · lenses: aesthetic-critic
**Problem:** `.assay-verdict-hero.hold` fills the whole hero with `--color-fail-bg`; demo-banner/error stack colored text on colored bg — giving the payoff screen an "alert toast" wash rather than a calm instrument reading, and compressing body/score contrast.
**Why:** A full pink/green hero feels like an error, not a report, and hurts the gradient-score legibility on top of it.
**Fix:** Treat status as an accent, not a fill: neutral `--color-panel` card, verdict via left border + icon color + a small tinted eyebrow (as `.rd-verdict` already does), reserving full-bleed tint for the small banner.
**Evidence:** `globals.css:2306-2308` vs `.rd-verdict` `:3938-3939`.
**Verify:** The verdict hero reads as a neutral card with a status accent, not a saturated panel.

### [P3-5] Over-applied ambient motion contradicts "Calm Mode"  `brand` · effort:S · lenses: aesthetic-critic
**Problem:** A hero "breathe" glow (9s), floating brand mark (5.5s), infinite CTA sheen sweep (5s), and a bubbling flask all loop simultaneously, several infinite and unrelated to state.
**Why:** Three-plus perpetual animations is the opposite of the "Calm Mode" the design notes claim, and an infinitely sweeping CTA shine is a demo-ware tell that reads as less trustworthy for a pre-deploy gate.
**Fix:** Keep entrance/stagger + state transitions; cut perpetual loops to at most one (keep a slow hero glow), and fire the sheen once on hover rather than looping.
**Evidence:** `globals.css:3001-3045`; `JudgingWaterfall` flask `:2141`.
**Verify:** At rest, at most one subtle loop runs; the CTA sheen fires only on hover.

### [P3-6] Card corner radii inconsistent (12 vs 14px)  `brand` · effort:S · lenses: aesthetic-critic
**Problem:** Most cards use `--radius-lg` (12px), but `.assay-rolebrief` uses undefined `--radius-card` (14px fallback) and `.assay-improve` uses `--radius-lg` with a conflicting 14px fallback — so RoleBrief/Improve show 14px corners next to 12px verdict/judging/fix cards in the same column.
**Why:** A 2px mismatch between adjacent stacked panels reads as "assembled by different people".
**Fix:** Define `--radius-card` once in `:root` (pick 12 or 14) and reference it everywhere, or replace the ad-hoc fallbacks with `--radius-lg`.
**Evidence:** `globals.css:1957`, `:2422`, `:64`, `:2299`, `:2105`.
**Verify:** Every card in the verdict column shares one radius.

### [P3-7] Cool-grey hairline borders ignore the warm token + don't theme  `intake` · effort:M · lenses: aesthetic-critic
**Problem:** Dozens of cockpit/side-panel borders are hardcoded `rgba(31,35,32,…)`/`rgba(43,39,36,…)` — cool near-black ignoring the warm `--line` token (#e7dbc4) — and never switch in dark mode, so they read cold on bone paper and stay light-mode values under `.dark`.
**Why:** The warm-bone identity lives or dies on border color; cool hairlines fight the paper and show as pale seams on dark surfaces — a visible theming bug.
**Fix:** Replace every `rgba(31,35,32,x)`/`rgba(43,39,36,x)` border with `var(--color-border)` (or `color-mix` on `--color-fg`).
**Evidence:** `globals.css:778,790,930,970,984,1097,1137,1206,1383,1443,1463`.
**Verify:** Toggle dark mode — all hairlines flip and inherit the warm hue.

### [P3-8] Verdict litmus meter carries no fail→ship color meaning  `verdict` · effort:S · lenses: aesthetic-critic
**Problem:** The Fail/Risky/Ship track uses the `--litmus` gradient (accent → transparent), so the scale under the knob doesn't map plum-fail→green-ship; only the landing `.lp-report-meter` uses a true fail→warn→pass gradient.
**Why:** The knob is labeled Fail/Risky/Ship but sits on a mono-plum fade, so the meter looks decorative rather than a readout — defeating the "litmus" glance.
**Fix:** Give the verdict meter the same semantic gradient the landing card uses (`linear-gradient(90deg, var(--color-fail), var(--color-warn) 52%, var(--color-pass))`).
**Evidence:** `globals.css:2768-2775` vs `:3359-3365`.
**Verify:** The knob's color under position maps to a real fail→ship reading, consistent with the landing meter.

### [P3-9] Advisory policy silently drops k to 1  `intake` · effort:S · lenses: logic-reviewer
**Problem:** `advisory_policy()` sets k=1, but the intake toggle copy only says advisory "warns instead of blocks" — it never mentions the held-out certification just became a single sample.
**Why:** A user picking advisory for a softer gate may not realize pass^k became pass^1, which materially changes what a pass means.
**Fix:** Either keep k independent of the strict/advisory toggle (advisory changes blocking, not sample count), or surface the k change in the toggle hint.
**Evidence:** `apps/api/assay_api/deployability.py:72-78`; `AgentIntake.tsx:223-227`.
**Verify:** Selecting advisory either keeps k unchanged or shows "advisory = single trial" in the hint.

### [P3-10] "Certified" vs TraceRazor "optional fixes" honesty seam  `trace-audit` · effort:S · lenses: logic-reviewer
**Problem:** `_trace_auditor` marks trace fixes "optional" when certified even with non-empty `audit.fixes`, while `deriveFixes` surfaces those same fixes as info items — so a certified agent that TraceRazor says wastes tokens is called optional by the CLI/refinery and a fix by the UI.
**Why:** A mild honesty seam about whether "certified" means "nothing left to fix".
**Fix:** Pick one stance: certified means the trace gate passed and fixes are always framed as optional efficiency wins, *or* unresolved high-savings fixes downgrade ship→probation. Make refinery and web agree.
**Evidence:** `agent_refinery.py:369-378`; `assay.ts:176-183`.
**Verify:** A certified run frames trace fixes identically in CLI/refinery and web.

### [P3-11] TAS gate isn't independent of the exam grade  `trace-audit` · effort:M · lenses: logic-reviewer
**Problem:** The `task_value_score` fed to TraceRazor is literally `mean(held_mean.values())` — the mean held-out competency score — yet TAS is marketed as a distinct third gate. Trace "adequacy" is partly a re-expression of the grade it's meant to independently corroborate.
**Why:** A high-scoring agent gets a tailwind on TAS and vice-versa, inflating the appearance of independent confirmation.
**Fix:** Feed TraceRazor a task-completion signal derived from trace/tool behavior (required tool calls, reasoning steps present), not the rubric grade. If it must consume the grade, stop marketing it as independent and label it a grade-conditioned efficiency score.
**Evidence:** `orchestrator.py:328`; `trace_audit.py:53`; `deployability.py:237`.
**Verify:** TAS moves independently of the competency mean on a controlled pair of runs, or the copy no longer claims independence.

### [P3-12] Two file-export endpoints wired in the client, never called  `api` · effort:S · lenses: functionality-qa
**Problem:** `assayApi.agentSpecFileExport` and `examPackFileExport` have zero callers; the UI only uses the JSON `downloadJson` path.
**Why:** Dead client surface implying an export capability users can't reach.
**Fix:** Either surface them (a "download AGENTS.md + tools" bundle button — a natural home given P1-8), or delete the unused methods and endpoints.
**Evidence:** `apps/web/src/lib/api.ts:42-45,97-100`; grep finds only api.ts.
**Verify:** Either a button calls each export, or grep finds no references to the removed methods.

> **Positioning notes (P2/P3, low-effort copy, folded into the growth sprint):** elevate
> "no SDK, no dataset, no tracing — just your agent.md" to the hero subhead (`Landing.tsx:32,72`,
> `AgentIntake.tsx:80`); add lifecycle framing "Assay certifies before deploy; wire your
> observability platform after" (`Landing.tsx:139`); promote the CI gate to a top-of-page section
> and the footer run-modes (`Landing.tsx:199`); document the full CLI verb set
> (scan/doctor/gate/improve/compare) in a `docs/cli.md` (`cli.py:99-149`); wire the repo's own CI
> to run the Assay Action on a sample agent.md (`.github/workflows/ci.yml`); fix the inert
> `.is-static` footer links (`Landing.tsx:185-204`); add a non-HR starter template/pack so the aha
> lands beyond recruiters (`assayTemplates.ts`); make suite cards drill into a read-only probe list
> (`suites/page.tsx:90-119`); converge terminology and type-scale/tokens
> (`globals.css` fractional sizes at 1786/2254/2582). These are real but low-severity; batch them
> behind the P0/P1 work.

---

## Sequencing — the five to do first

1. **[P0-2] Add LICENSE + CONTRIBUTING + SECURITY (S).** Cheapest possible unblock and a hard
   prerequisite for *everything* growth-related — without a license the repo legally can't be
   adopted, so no other marketing work compounds. One afternoon; do it first.

2. **[P0-1] Make pass^k real (or drop it) (L).** This is the product's central truth claim and the
   root of the most damaging credibility risk: users trusting a "pass^3" that measures pass^1. It's
   L-effort and touches the adapter contract, so start it early and in parallel — it gates whether
   P2-10 (tailored progress count) and the pass^k badge in P1-8 are even honest to ship.

3. **[P1-1] Remove gameable scoring bonuses (S).** Tiny diff, outsized payoff: it closes a
   false-pass path in the same gate P0-1 is fixing. Doing it alongside P0-1 means the certification
   becomes trustworthy on both axes (real variance *and* rubric-only scoring) in one sprint.

4. **[P1-2] Unify the verdict lexicon behind one constants module (S).** Three lenses independently
   flagged it, it's S-effort, and it's the connective tissue for the whole verdict story — every
   later UI change (P1-7 reorder, P2-2 CTA, P2-4 single source of truth) is cleaner once one word
   means one thing across README, landing, tables, and the meter.

5. **[P1-3]/[P1-4] Honest demo mode + a zero-input hero CTA (S each).** Together these fix the top
   of the funnel: a stranger can run a sample in one click (P1-4) and is never ambushed by a
   post-run "demo" reveal (P1-3). Both are S-effort front-end copy/flow changes with the highest
   first-impression leverage per hour, and they make the now-honest engine (steps 2-3) actually
   reachable by a first-time visitor.

*Rationale:* the ordering front-loads the two S-effort P0/P1 fixes that unblock adoption and
credibility (license, scoring), pairs the one L-effort P0 (pass^k) to run in the background since
it's the deepest, and finishes the first sprint with three S-effort UX/brand fixes that make the
newly-honest product legible and reachable. The heavier P1-6/P1-8 (refinery identity, shareable
proof) and the P2 dead-surface cleanup follow once the core claim is true and the funnel is open.
