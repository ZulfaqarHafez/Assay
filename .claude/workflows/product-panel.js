export const meta = {
  name: 'product-panel',
  description: 'Six independent evaluators question every Assay feature; verify severe findings; write a ranked backlog + positioning brief',
  phases: [
    { title: 'Evaluate', detail: 'six evaluators fan out over code + product' },
    { title: 'Verify', detail: 'adversarially check each P0/P1 finding' },
    { title: 'Synthesize', detail: 'write backlog.md and positioning.md' },
  ],
}

const CONTEXT = `
Assay is a pre-deployment litmus test for AI agents (repo: C:\\Users\\zulfa\\Interviu).
A user brings an agent definition (agent.md / AGENTS.md / JSON / YAML / TOML), Assay runs it
through an adversarial exam (k seen + k held-out trials per probe across ~6 failure categories),
and returns: a FAIL/RISKY/SHIP verdict gated at pass^k, a per-capability score breakdown, a
TraceRazor trace-efficiency audit, a "what to fix" list, and an auto-refined AGENTS.md.

Monorepo:
- apps/api  — Python FastAPI backend (package assay_api): orchestrator.py, scoring.py,
  exam_packs.py, deployability.py, agent_refinery.py, agent_diff.py, agent_formats.py,
  trace_audit.py, role_intelligence.py, product_review.py, routers/*.
- apps/web  — Next.js 16 / React 19 / TypeScript. Routes: / (intake -> judging -> verdict),
  /runs, /runs/[runId], /agents, /agents/[candidateId], /suites. Components in
  src/components/assay/*, src/components/scorecard/*, src/components/trace/*. Styling is
  Tailwind v3 + a ~2700-line src/app/globals.css using a warm-bone / deep-ink / plum token
  palette. Design helpers in src/lib/assay.ts and src/lib/derive.ts.
- docs/product-strategy.md is the current strategy map; README.md is the pitch.

JUST FIXED (do NOT re-report these as new findings — they work now):
1. TraceRazor audit no longer times out (thread-based timeout + TRACERAZOR_BIN auto-set); the
   scorecard now surfaces report.fixes (token-saving patches), not just a TAS number.
2. Deployability is threshold-based and honest: GET /runs/{id}/deployability returns per-check
   pass/fail chips + a plain-English rule ("every held-out trial must clear 0.80, not 100");
   intake has a strict/advisory toggle + pass-bar slider.
3. The refined agent.md shows a real before/after unified diff + validated/not-yet-validated state.
4. Intake accepts JSON/YAML/TOML/frontmatter, normalized server-side.
5. The bottom "Preflight Council" became a useful ReviewCouncil under the cockpit (flag count,
   expandable evidence + next steps).

KNOWN open gaps (fair game, but go deeper than these): exam packs are HR-heavy; no in-UI suite
authoring; the iterate/improve loop is half-built; the research drawer tab often never populates;
main.py is one big router file; the Interviu->Assay rename is half-done; no auth/multi-tenant story.

Servers are currently stopped, so evaluate by READING the real code and docs (cite file:line as
evidence). Be specific and skeptical — question whether each feature earns its place.
`

const FINDING_ITEM = {
  type: 'object',
  additionalProperties: false,
  properties: {
    surface: { type: 'string', description: 'e.g. intake, verdict, run-detail, trace-audit, refinery, suites, api, brand' },
    severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
    finding: { type: 'string', description: 'the specific problem, one sentence' },
    why: { type: 'string', description: 'why it matters to a real user' },
    recommendation: { type: 'string', description: 'a concrete, buildable fix' },
    effort: { type: 'string', enum: ['S', 'M', 'L'] },
    evidence: { type: 'string', description: 'file:line or a precise observable behavior' },
  },
  required: ['surface', 'severity', 'finding', 'why', 'recommendation', 'effort', 'evidence'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    evaluator: { type: 'string' },
    findings: { type: 'array', items: FINDING_ITEM },
  },
  required: ['evaluator', 'findings'],
}

const MARKET_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    evaluator: { type: 'string' },
    findings: { type: 'array', items: FINDING_ITEM },
    positioning: {
      type: 'object',
      additionalProperties: false,
      properties: {
        icp: { type: 'string', description: 'the sharpest ideal customer profile' },
        oneLiner: { type: 'string' },
        category: { type: 'string' },
        wedge: { type: 'string', description: 'the initial beachhead use case' },
        competitors: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              angle: { type: 'string', description: 'how they position' },
              gapAssayCanClaim: { type: 'string' },
            },
            required: ['name', 'angle', 'gapAssayCanClaim'],
          },
        },
        topProductChanges: { type: 'array', items: { type: 'string' }, description: '3-5 marketing-driven product changes' },
      },
      required: ['icp', 'oneLiner', 'category', 'wedge', 'competitors', 'topProductChanges'],
    },
  },
  required: ['evaluator', 'findings', 'positioning'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['CONFIRMED', 'REJECTED', 'REVISED'] },
    reason: { type: 'string' },
    revisedSeverity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
  },
  required: ['verdict', 'reason'],
}

const EVALUATORS = [
  {
    key: 'functionality-qa',
    schema: FINDINGS_SCHEMA,
    prompt: `${CONTEXT}

You are a ruthless FUNCTIONALITY QA engineer. Trace each end-to-end flow through the code and find
where it breaks, dead-ends, or silently no-ops: intake -> candidate -> run -> stream -> verdict ->
refinery -> "test improved version" -> comparison; also /runs, /agents, /suites, exports, the trace
drawer, role analysis, and the connectors rail. Read apps/web/src/app/page.tsx,
apps/web/src/app/runs/[runId]/RunDetail.tsx, apps/web/src/lib/queries/*, apps/api/assay_api/routers/*,
and orchestrator.py. For every real defect return a finding with file:line evidence. Prioritize
things that would make a first-time user hit a wall. Return 6-12 findings.`,
  },
  {
    key: 'ux-critic',
    schema: FINDINGS_SCHEMA,
    prompt: `${CONTEXT}

You are a senior UX critic. Evaluate friction and clarity across every route. Question empty,
loading, and error states; information hierarchy; whether a stranger can get from landing to a
verdict without confusion; whether the verdict is legible in 5 seconds; whether the workspace
(/runs/[id]) overwhelms. Read the assay components and globals.css. Cite the component/line.
Return 6-12 findings, each with a concrete UX fix.`,
  },
  {
    key: 'aesthetic-critic',
    schema: FINDINGS_SCHEMA,
    prompt: `${CONTEXT}

You are a discerning visual/aesthetic designer. Judge typography scale/rhythm, color usage against
the warm-bone/ink/plum tokens, spacing and density, component polish, motion, and overall craft.
Read src/app/globals.css and the assay components. Question anything that looks unfinished, generic,
or inconsistent. Be specific (which token, which selector, which component). Return 5-10 findings
with concrete visual fixes.`,
  },
  {
    key: 'logic-reviewer',
    schema: FINDINGS_SCHEMA,
    prompt: `${CONTEXT}

You are a rigorous product-logic reviewer. For EACH feature ask: does it deserve to exist, is it
coherent, is it honest? Interrogate the scoring semantics (pass^k, transfer gap, TAS, certified vs
deployable), verdict wording, feature redundancy, naming (Interviu vs Assay), and whether the
refinery's advice is actually grounded. Read scoring.py, deployability.py, agent_refinery.py,
role_intelligence.py, src/lib/assay.ts. Return 6-12 findings; flag both "this is wrong" and "this
feature is noise, cut or merge it".`,
  },
  {
    key: 'marketer-positioning',
    schema: MARKET_SCHEMA,
    prompt: `${CONTEXT}

You are a world-class product marketer specializing in developer/AI tools. First do REAL web
research (use web search) on the agent-eval / LLM-eval landscape: promptfoo, Braintrust, LangSmith
evals, Galileo, Patronus AI, Giskard, AgentDojo, DeepEval, Arize Phoenix — how each positions, who
they target, what category language they use, and where the whitespace is. THEN decide Assay's
sharpest positioning: ICP, one-liner, category, wedge use case, a competitor map (name, their angle,
the gap Assay can claim), and 3-5 marketing-driven product changes. Also return 4-8 findings where
the product's current framing/story undercuts the positioning (README.md, landing copy, naming).
Ground every competitor claim in what you actually found.`,
  },
  {
    key: 'marketer-growth',
    schema: MARKET_SCHEMA,
    prompt: `${CONTEXT}

You are a growth marketer who ships. Evaluate how Assay would actually get adopted: the demo-ability
(can someone feel the "aha" in 60 seconds?), the README/landing as a conversion asset, screenshots
as marketing, the CI-gate story (proposals/assay-cli-github-action.md), an OSS vs paid angle, and
shareable proof artifacts. Do light web research on how competitors drive adoption (free tiers, CI
integrations, open-source, leaderboards). Return a positioning block (ICP/one-liner/category/wedge/
competitors/topProductChanges focused on GROWTH levers) and 4-8 findings on growth/adoption gaps in
the current product, each with a concrete, buildable change. Cite files where relevant (README.md,
proposals/*, apps/web).`,
  },
]

phase('Evaluate')
const raw = await parallel(
  EVALUATORS.map((e) => () =>
    agent(e.prompt, { label: `eval:${e.key}`, phase: 'Evaluate', schema: e.schema })
      .then((r) => (r ? { ...r, key: e.key } : null))
  )
)

const results = raw.filter(Boolean)
const allFindings = results.flatMap((r) =>
  (r.findings || []).map((f, i) => ({ ...f, source: r.key, id: `${r.key}-${i}` }))
)
log(`Collected ${allFindings.length} findings from ${results.length}/${EVALUATORS.length} evaluators`)

// Verify the severe findings adversarially — a P0/P1 must survive a skeptic that
// tries to reject it as not-real, not-grounded, or already-fixed.
phase('Verify')
const severe = allFindings.filter((f) => f.severity === 'P0' || f.severity === 'P1')
const verified = await parallel(
  severe.map((f) => () =>
    agent(
      `${CONTEXT}

Adversarially verify this ${f.severity} finding. Try to REJECT it: is it real, grounded in the
actual code/docs (check the cited evidence), still open (not in the JUST FIXED list), and is the
severity right? Read the cited file if you can.

Finding: ${f.finding}
Surface: ${f.surface}
Why it matters: ${f.why}
Evidence claimed: ${f.evidence}
Recommendation: ${f.recommendation}

Default to REJECTED if you cannot confirm it. Use REVISED (with revisedSeverity) if it is real but
mis-severitied.`,
      { label: `verify:${f.id}`, phase: 'Verify', schema: VERDICT_SCHEMA }
    ).then((v) => ({ finding: f, verdict: v }))
  )
)

const verdictById = new Map()
verified.filter(Boolean).forEach((v) => verdictById.set(v.finding.id, v.verdict))

// Keep: all P2/P3 as-is; P0/P1 only if not REJECTED (apply any REVISED severity).
const kept = allFindings
  .map((f) => {
    if (f.severity === 'P2' || f.severity === 'P3') return { ...f, verified: 'n/a' }
    const v = verdictById.get(f.id)
    if (!v) return { ...f, verified: 'unverified' }
    if (v.verdict === 'REJECTED') return null
    if (v.verdict === 'REVISED' && v.revisedSeverity) return { ...f, severity: v.revisedSeverity, verified: 'revised' }
    return { ...f, verified: 'confirmed' }
  })
  .filter(Boolean)

const rejectedCount = severe.length - kept.filter((f) => f.verified === 'confirmed' || f.verified === 'revised').length
log(`Verified: ${kept.length} findings kept (${rejectedCount} severe findings rejected/unverified)`)

const positioning = results
  .filter((r) => r.positioning)
  .map((r) => ({ source: r.key, ...r.positioning }))

// Synthesis: one agent writes the ranked backlog, one writes the positioning brief.
phase('Synthesize')
const [backlogMarkdown, positioningMarkdown] = await parallel([
  () =>
    agent(
      `${CONTEXT}

You are the panel lead. Below are the surviving findings (JSON) from six evaluators, already
adversarially verified. Write docs/panel/backlog.md: a single ranked improvement backlog.

Rules:
- Dedup and merge near-duplicate findings across evaluators (note when multiple lenses agree —
  that raises confidence).
- Rank strictly by severity (P0 first) then by impact/effort. Within each severity, order by
  (high impact, low effort) first.
- For each item use this exact shape:
  ### [P0-1] <short title>  \`surface\` · effort:S/M/L · lenses: <which evaluators>
  **Problem:** ...  \n  **Why:** ...  \n  **Fix:** ...  \n  **Evidence:** file:line  \n  **Verify:** how to confirm it's done.
- Start with a one-paragraph executive summary and a count table (P0/P1/P2/P3).
- End with a "Sequencing" section: the 5 items to do first and why.
Output ONLY the markdown file content.

FINDINGS JSON:
${JSON.stringify(kept, null, 1)}`,
      { label: 'synth:backlog', phase: 'Synthesize' }
    ),
  () =>
    agent(
      `${CONTEXT}

You are the head of product marketing. Below are two positioning blocks from the positioning and
growth marketers (JSON). Reconcile them into docs/panel/positioning.md:
- A crisp recommended POSITIONING: one ICP, one one-liner, the category, the wedge.
- A competitive map table (competitor | their angle | the gap Assay claims).
- A messaging section: the 3 messaging pillars and the hero headline + subhead for the landing/README.
- The top 5 marketing-driven PRODUCT changes (merged and ranked), each with a one-line rationale.
- A short "what to change in the README today" list.
Be decisive — pick one positioning, don't hedge. Output ONLY the markdown file content.

POSITIONING JSON:
${JSON.stringify(positioning, null, 1)}`,
      { label: 'synth:positioning', phase: 'Synthesize' }
    ),
])

const counts = kept.reduce((acc, f) => ((acc[f.severity] = (acc[f.severity] || 0) + 1), acc), {})
return { backlogMarkdown, positioningMarkdown, counts, keptCount: kept.length, findings: kept, positioning }
