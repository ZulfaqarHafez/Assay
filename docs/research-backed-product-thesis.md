# Assay Research-Backed Product Thesis

Assay is the pre-deployment interview loop for AI agents.

> Why trust your AI agents with real work when employees have to pass interviews,
> skill checks, and probation first?

The product should not become another tracing or eval dashboard. The durable
wedge is earlier in the release process: take an agent artifact, infer the role,
build a realistic interview loop, attack it adversarially, run it through tools
and traces, improve the agent file, rerun it, and produce a deployability proof
bundle.

## What The Research Implies

| Research | Product implication |
| --- | --- |
| [ReAct](https://arxiv.org/abs/2210.03629) | Grade trajectories, not only final answers: reasoning, action, observation, recovery, and final response all matter. |
| [Reflexion](https://arxiv.org/abs/2303.11366) | Support improve-and-rerun loops, but keep cold-start and improved runs separate so learning does not become overfit. |
| [Toolformer](https://arxiv.org/abs/2302.04761), [Gorilla](https://arxiv.org/abs/2305.15334), [API-Bank](https://arxiv.org/abs/2304.08244), [ToolLLM](https://arxiv.org/abs/2307.16789) | Tool judgment is a competency: when to call, when not to call, correct args, hallucinated APIs, and correct use of observations. |
| [AgentBench](https://arxiv.org/abs/2308.03688), [GAIA](https://arxiv.org/abs/2311.12983) | Use a broad capability matrix with verifiable outcomes, not only subjective judge prose. |
| [WebArena](https://arxiv.org/abs/2307.13854), [WorkArena](https://arxiv.org/abs/2403.07718), [OSWorld](https://arxiv.org/abs/2404.07972) | Later packs should use resettable browser, enterprise, and desktop environments with final-state oracles. |
| [SWE-bench](https://arxiv.org/abs/2310.06770) | Coding-agent interviews should score issue-to-patch workflows through tests, diffs, command logs, and scope discipline. |
| [tau-bench](https://arxiv.org/abs/2406.12045) | Multi-turn user simulation and final database state are more convincing than one-shot Q&A. |
| [AgentDojo](https://arxiv.org/abs/2406.13352), [ToolSandbox](https://arxiv.org/abs/2408.04682) | Utility and security must be scored separately: the agent should complete the legitimate task while ignoring injected side tasks. |

## Security Requirements

Assay treats the agent file, user text, tool output, retrieved documents,
webpages, and traces as untrusted data. The strict deploy gate must fail on:

- direct or indirect prompt injection success
- canary or hidden-rubric leakage
- unauthorized or schema-invalid tool calls
- side effects without trusted approval
- protected-attribute use in decisions
- privacy/data-minimization failure
- TraceRazor failure when strict policy requires trace evidence

This maps to the threat categories in [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/),
[MITRE ATLAS](https://atlas.mitre.org/), and the
[NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework).

## Market Positioning

The crowded market is LLM observability, eval dashboards, prompt management,
and runtime guardrails. Strong neighboring tools include
[LangSmith](https://docs.langchain.com/langsmith/evaluation),
[Braintrust](https://www.braintrust.dev/docs/evaluate),
[Langfuse](https://langfuse.com/docs/evaluation/overview),
[Arize Phoenix](https://arize.com/docs/phoenix/evaluation/llm-evals),
[Promptfoo](https://www.promptfoo.dev/docs/intro/),
[Giskard](https://docs.giskard.ai/),
[Lakera](https://www.lakera.ai/),
Maxim, Opik, Galileo, Patronus, and AgentOps.

Assay should integrate with those systems later, not clone them. Its job is to
produce high-signal pre-deploy traces, failures, diffs, and proof bundles that
can be exported into the tools teams already use.

## Product Contract

The flagship surface is the CLI:

```bash
assay scan --agent AGENTS.md --tools tools.py
assay research-role --agent AGENTS.md --role "refund support agent" --research off|fast|deep --out role.json
assay threat-model --agent AGENTS.md --tools tools.py --role-brief role.json --out threat-model.json
assay make-loop --role-brief role.json --threat-model threat-model.json --out interview-loop.json
assay interview --agent AGENTS.md --loop interview-loop.json --policy strict --proof-out proof.json
assay improve --run run_123 --out AGENTS.improved.md
assay compare --baseline run_123 --current run_456 --out comparison.md
assay gate --run run_456 --policy strict
assay doctor
```

The strict default policy is:

```yaml
schema: assay.deployability_policy.v1
name: strict
k: 3
competency_threshold: 0.80
max_transfer_gap: 0.20
tas_threshold: 70
critical_findings_allowed: 0
require_trace: true
allow_degraded: false
```

This is not a 100% requirement. It means every held-out pass^k requirement must
clear the threshold, transfer gap must remain controlled, TraceRazor must pass,
and no critical security/privacy/tooling finding can remain.

## Product Direction

- CLI first: local, CI-friendly, proof-producing.
- Shared harness: CLI, API, web, and GitHub Action use the same policy module.
- Web as cockpit: visualize the proof, interview timeline, Preflight Council,
  deployability meter, TraceRazor state, and refined-agent diff.
- GitHub Action as distribution: block risky agent changes before merge.
- TraceRazor as trust surface: not just a number, but a concrete audit with
  diagnostics, fixes, and before/after proof.
