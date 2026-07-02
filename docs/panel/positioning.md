# Assay Positioning Brief

*Reconciled by the head of product marketing from the positioning and growth marketer inputs.
This is the single source of truth for how we talk about Assay. Where the two marketers
disagreed, one call was made — the disagreements and the rationale are noted inline.*

---

## Recommended positioning

**ICP (one, not a spread).**
The engineer or 2–8 person platform/AI team who owns an agent's `agent.md` / `AGENTS.md`
and is personally accountable for the "is this safe to ship?" deploy gate — the person who
gets paged when the agent leaks data or gets prompt-injected in prod. They already have an
`agent.md`, they live in GitHub, and they have **not** instrumented tracing, have no golden
eval dataset, and are not going to write a promptfoo config or wire an SDK. This is the tier
*below* the Notion/Ramp-scale platform team that Braintrust and LangSmith serve — the team
those tools are too heavy for.

**One-liner (hero).**
> **Assay is the pre-deployment litmus test for AI agents: point it at the `agent.md` you
> already have and it fails the build before your agent breaks in production — no SDK, no
> dataset, no tracing to wire.**

*(Resolves the split: growth's "fails the build" verb carries the CI wedge; positioning's
"no SDK/dataset/tracing" tail carries the zero-setup wedge. We keep both, in that order.)*

**Category.**
Agent pre-deployment certification — **a deploy-gate step, deliberately positioned against
the crowded "agent eval + observability platform" category.** Assay is not a platform you
live in; it is a gate you pass. Category shorthand: **"the litmus test," not "the eval
platform."** The nearest owned lane is the "CI test suite for agents" slot Promptfoo opened —
we take the **held-out `pass^k` deploy gate with a human-readable verdict** end of it, not the
raw-test-runner end.

**Wedge.**
The single-artifact, zero-setup safety exam: paste `agent.md` → adversarial exam across the
six failure modes that get agents pulled (prompt injection, confidentiality, compliance,
fairness, refusal boundaries, ambiguity) → `pass^k` held-out **ship / risky / hold** verdict +
a ranked punch-list → drop the `assay run` CLI / GitHub Action into CI so the verdict becomes
a **required merge check**. Land on paste-and-verdict; expand into the CI gate. **Beachhead
vertical is support / internal-ops agents** (where injection + confidentiality are the scary
failures) — **not HR.** The HR-heavy default exam pack currently undercuts this and must
broaden (see product change #1).

---

## Competitive map

| Competitor | Their angle | The gap Assay claims |
|---|---|---|
| **Braintrust** (obs + eval platform, $80M B, Notion/Replit/Cloudflare/Ramp) | Eval = experiments against real datasets + production tracing + CI gates, in one platform you instrument and live in. | Braintrust needs a golden dataset and instrumentation before a single number. Assay manufactures the adversarial dataset from your `agent.md` and returns a verdict in ~20s with zero instrumentation. **Assay is the pre-dataset, pre-instrumentation first gate; Braintrust is where you graduate once you have traffic worth building datasets from.** |
| **Promptfoo** (OpenAI-owned, MIT, ~350k devs) | OSS-first declarative test/red-team runner; GitHub Action + CLI + OWASP Agentic Top-10 presets; adoption from MIT license + huge example library + "used by OpenAI/Anthropic" social proof. | Promptfoo is config-first — you author YAML providers/prompts/assertions before value. **Assay is artifact-first: the `agent.md` IS the config, the exam is pre-authored, and Assay ships an opinionated `pass^k` ship/risky/hold verdict where Promptfoo hands you a results matrix.** Second wedge: the OpenAI acquisition makes Promptfoo vendor-coupled — Assay claims vendor-neutral, local-first, "runs on your keys, sends nothing you don't control." |
| **Patronus AI** (Detect · Debug · Deploy; Lynx/GLIDER/Percival) | Proprietary research-backed evaluators; trace-analysis-heavy; needs real production traces to shine. | Patronus's loop is trace-in → failures-out — fundamentally a **post-deployment** debugger. Assay produces the traces adversarially and judges **before** any real traffic exists. **Assay is the gate you pass to earn the right to be in production, where Patronus then watches you.** Own "before" cleanly. |
| **Galileo** (agent obs + guardrails; eval-to-guardrail) | Runtime guardrail — catch failures live, continuously; a heavyweight, always-on surface. | Assay is a **one-shot certification, not a runtime dependency** — you don't route traffic through it. **"You shouldn't ship a guardrail around an agent you never certified in the first place." Assay is the check that precedes the guardrail.** |
| **Garak / PyRIT** (free OSS scanners, big-vendor trust, broad probe libraries) | The "serious security" reference scanners; long vulnerability logs a security engineer interprets. | Garak/PyRIT emit logs for a red-team analyst. **Assay converts findings into a merge-blocking ship/risky/hold with plain-English fixes tied to the failing trace — built for the PR author, not the analyst.** |
| **AgentDojo** (academic benchmark, 97 tasks / 629 injection cases) | Extensible research environment for comparing injection defenses — not a product. | AgentDojo scores *defenses in the abstract*; it never gives a builder a verdict for *their* one agent. **Assay operationalizes the same adversarial-injection science into a paste-and-ship product with a decision at the end** — and cites AgentDojo as pedigree ("the exam shape is AgentDojo-inspired"). |
| **DeepEval / Phoenix / Giskard / LangSmith** (code-first tests, tracing, ML/LLM scans, manual review) | All assume you instrument, write tests, or ingest traces before you get value. | One shared assumption Assay breaks across the whole cluster: **value requires setup.** None will tell you SHIP / DON'T-SHIP from an `agent.md` alone — they give you dashboards, tests, and metrics to interpret. **Assay makes the call. Zero-instrumentation verdict from the spec you already have.** |

**The one line that runs through every cell:** everyone else needs a dataset, tests, traces,
or a Python harness *first*. **Assay needs your `agent.md`.** That is the single claim true of
Assay and false of every competitor — it leads every surface.

---

## Messaging

### Three pillars

1. **Zero-instrumentation verdict.** No SDK, no golden dataset, no tracing, no YAML to author.
   The `agent.md` you already ship *is* the input. This is the one differentiator true of us
   and false of Braintrust / LangSmith / Patronus / Promptfoo — so it is pillar one, not an
   aside.
2. **We make the call.** Not a results matrix, not a vulnerability log — an opinionated,
   `pass^k` held-out **ship / risky / hold** verdict with a ranked, plain-English punch-list
   and an auto-refined `AGENTS.md`. Held-out `pass^k` means a single lucky pass never
   certifies.
3. **A gate, not a platform.** One command blocks the merge on held-out failures. Assay is a
   required check on your PR, not another dashboard to live in — and it certifies *before*
   deploy, handing off cleanly to observability (Braintrust / Galileo / Patronus) for *after*.

### Hero headline + subhead (landing / README)

> # Bring your `agent.md`. Find out where it breaks — before your users do.
>
> Assay runs the agent definition you already have through an adversarial exam across the six
> failure modes that get agents pulled from production, and returns a **ship / risky / hold**
> verdict with a ranked list of fixes. No SDK. No dataset. No tracing to wire. Drop it into CI
> and it fails the build before the agent fails in prod.

---

## Top 5 marketing-driven product changes (merged + ranked)

*Both marketers' lists merged; ranked by impact on the wedge. Rationale is one line each.*

1. **Ship a repo-root `LICENSE` (MIT), plus `CONTRIBUTING.md` and `SECURITY.md`.**
   *Without an OSS license the project is legally un-adoptable and invisible to the OSS-first
   motion every competitor (Promptfoo/Giskard) runs on — this is the cheapest, highest-leverage
   unlock and a prerequisite for everything below.* (Verified: no root `LICENSE` exists; only
   `node_modules/*/LICENSE`.)

2. **Make the CI gate the hero; broaden the default exam pack off HR to support/ops.**
   *The GitHub Action + `assay run --pass-threshold` is the single stickiest, most defensible
   thing Assay owns vs. one-off local tools — yet it's buried at README line 123, and the
   default pack is `hr-v1` in both the README and `action.yml`, misaligning the shipped product
   with the support/injection beachhead.* Lead with a "required check on your PR" story and flip
   the Action default to a support pack. (Verified: `action.yml:11` default `hr-v1`;
   `SUPPORT_TRIAGE_V1` already exists in `exam_packs.py:205` but isn't the default.)

3. **Dogfood the Assay Action in the repo's own CI and ship a shareable proof artifact.**
   *A live self-gated PR with a real Assay verdict comment is the most persuasive screenshot in
   the README and doubles as the copy-paste example — and a portable run permalink + embeddable
   "Assay: SHIP — held-out pass^3" badge is the top-of-funnel loop (badge → click → your own
   run).* (Verified: `ci.yml` never calls `.github/actions/assay`; proof today is only a local
   JSON download.)

4. **Lead every surface with "zero-instrumentation / no SDK / no dataset" as a literal
   comparison.**
   *It's the ONE claim true of Assay and false of every competitor, so it must be the headline
   contrast, not a passing mention — add an explicit "Assay vs. an eval platform" block: "They
   need a dataset and tracing first. Assay needs your `agent.md`."*

5. **Finish the Interviu→Assay rename in the two most public surfaces first, and unify the
   verdict lexicon.**
   *The PR comment marker and artifact name ship as `assay-assay` straight into every user's
   pull request, and the verdict words drift (README "FAIL/RISKY/SHIP", Landing "ship/risky/
   hold", SampleReport "Fail/Risky/Ship") — inconsistent naming erodes the "we make the call"
   credibility that is the whole positioning.* Pick **ship / risky / hold** (lowercase, in that
   order) and use it everywhere. (Verified: `action.yml:132,149`; rename note at README:216-218.)

*Deferred but noted (ranked 6–7, do next): a zero-input "Run the sample agent" button on the
landing hero so a visitor feels the aha in 60s without supplying input, and explicit lifecycle
framing — "Assay certifies before deploy; wire Braintrust/Galileo/Patronus for after" — that
makes Assay complementary to the incumbents instead of competing head-on.*

---

## What to change in the README today

- **Rewrite the top-of-fold around the wedge.** Lead with the hero headline above, the `assay
  run` one-liner, and the GitHub Action + PR-comment screenshot — move CI up from line ~123 to
  the fold.
- **Add shields.io badges** (currently zero): license (MIT, once shipped), CI status, and an
  "Assay: SHIP" self-verdict badge from the dogfooded run.
- **Swap the HR framing for support/ops.** Change the exam-category example (README lines
  17–19) and the default-pack command (line 130, `--pack hr-v1`) to a support pack, so the
  first thing a reader sees matches the beachhead.
- **Unify the verdict words to `ship / risky / hold`** everywhere in the README (it currently
  says "FAIL → RISKY → SHIP").
- **Market the already-built CLI verbs** (`scan` / `threat-model` / `gate` / `doctor`,
  `interview`) that the current docs omit.
- **Add a one-line "vs. an eval platform" callout** near the fold: *"They need a dataset and
  tracing first. Assay needs your `agent.md`."*
- **Delete or de-emphasize the internal-rename disclaimer** at the bottom (lines 216–218) — a
  prospect who reads "still uses the original name internally" reads "unfinished." Fix the
  public `assay-assay` surfaces, then drop the apology.
