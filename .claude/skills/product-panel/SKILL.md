---
name: product-panel
description: Run Assay's standing multi-evaluator product panel — six independent evaluators (functionality QA, UX critic, aesthetic critic, logic reviewer, and two pro marketers) question every feature, then a synthesis stage adversarially verifies the high-severity findings and writes a ranked improvement backlog plus a positioning brief. Use when the user asks to "evaluate the product", "spawn evaluators", "question every feature", "critique Assay", or before/between improvement-loop iterations.
---

# Product Panel

A re-runnable evaluation panel for the Assay product. It fans out six independent
evaluators over the codebase and the running product, verifies the severe
findings adversarially, and writes two artifacts:

- `docs/panel/backlog.md` — a ranked (P0→P3), concrete, verifiable improvement backlog.
- `docs/panel/positioning.md` — the marketers' brief: ICP, one-liner, competitive map,
  and the top marketing-driven product changes.

## How to run

This skill is powered by the Workflow at `.claude/workflows/product-panel.js`.
Invoke it with the Workflow tool:

```
Workflow({ scriptPath: ".claude/workflows/product-panel.js" })
```

The six evaluators and their lenses:

| Evaluator | Lens |
|---|---|
| Functionality QA | Does every flow actually work end-to-end? |
| UX critic | Friction, clarity, empty/loading/error states, "can a stranger reach a verdict?" |
| Aesthetic critic | Visual quality vs. the warm-bone/ink/plum token system |
| Logic reviewer | Does each feature deserve to exist? Are the scoring semantics coherent? |
| Marketer — positioning | What is this FOR? ICP, category, one-liner, wedge (with competitor research) |
| Marketer — growth | How does it sell? Demo-ability, landing/README copy, CI-gate story |

Each finding is `{surface, severity P0-P3, finding, why, recommendation, effort S/M/L, evidence}`.
The synthesis stage dedups, drops findings that can't cite a file or reproduce, and ranks the rest.

## When to re-run

Re-run after each batch of improvement-loop changes (or when a surface changes
substantially) so the backlog stays live. The loop skill consumes `docs/panel/backlog.md`.

## Notes for the runner

- Give evaluators the "recently fixed" list so they don't re-report Milestone-0 work
  (TraceRazor timeout, deployability policy UI, real md diff, multi-format intake, ReviewCouncil).
- Marketers must do real web research (promptfoo, Braintrust, LangSmith, Galileo, Patronus,
  Giskard, AgentDojo, DeepEval) before claiming positioning.
- After the workflow returns, write both markdown files and skim them for concreteness.
