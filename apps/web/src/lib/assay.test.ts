import { describe, expect, it } from "vitest";
import { deriveVerdict, deriveFixes, policyRuleSentence } from "./assay";
import type { DeployabilityDecision, DeployabilityPolicy, Scorecard } from "@/types/assay";

const baseScorecard: Scorecard = {
  run_id: "run_unit",
  status: "completed",
  certified: true,
  certificate_label: "Internal capability bar only",
  k: 3,
  thresholds: { competency: 0.8, max_transfer_gap: 0.2, tas: 70 },
  simulator_model: "unit",
  pass_at_k: { compliance: true, fairness: true },
  competency_scores: { compliance: 0.9, fairness: 0.85 },
  seen_scores: { compliance: 0.9, fairness: 0.85 },
  held_out_scores: { compliance: 0.9, fairness: 0.85 },
  transfer_gap: { compliance: 0.02, fairness: 0.05 },
  grader_disagreement: 0,
  trace_audit: {
    status: "ok",
    trace_id: "trace_unit",
    tas_score: 88,
    grade: "Good",
    passes: true,
    total_steps: 6,
    total_tokens: 500,
    metrics: {},
    savings: {},
    fixes: [],
    raw: {}
  },
  failure_reasons: [],
  created_at: "2026-07-01T00:00:00Z",
  lessons_applied: [],
  prior_run_id: null
};

const policy: DeployabilityPolicy = {
  schema: "assay.deployability_policy.v1",
  name: "strict",
  k: 3,
  competency_threshold: 0.8,
  max_transfer_gap: 0.2,
  tas_threshold: 70,
  critical_findings_allowed: 0,
  require_trace: true,
  allow_degraded: false
};

function decision(overrides: Partial<DeployabilityDecision>): DeployabilityDecision {
  return {
    schema: "assay.deployability_decision.v1",
    run_id: "run_unit",
    policy,
    verdict: "ship",
    deployable: true,
    label: "Ship",
    summary: "All gates passed.",
    blocking_reasons: [],
    warnings: [],
    critical_findings: [],
    passed_checks: ["k", "tracerazor"],
    failed_checks: [],
    metrics: {},
    generated_at: "2026-07-01T00:00:00Z",
    ...overrides
  };
}

describe("deriveVerdict", () => {
  it("maps the backend probation verdict onto the risky band", () => {
    const summary = deriveVerdict(
      baseScorecard,
      decision({ verdict: "probation", warnings: ["Run degraded to deterministic demo mode."] })
    );
    expect(summary.verdict).toBe("risky");
    expect(summary.headline).toMatch(/degraded/i);
  });

  it("surfaces the first blocking reason as the headline for do_not_ship", () => {
    const summary = deriveVerdict(
      baseScorecard,
      decision({
        verdict: "do_not_ship",
        deployable: false,
        blocking_reasons: ["fairness failed pass^3; every held-out trial must clear 0.80, not score 100."]
      })
    );
    expect(summary.verdict).toBe("hold");
    expect(summary.headline).toMatch(/fairness failed/);
  });

  it("keeps the certified-based fallback when no decision is supplied", () => {
    expect(deriveVerdict(baseScorecard).verdict).toBe("ship");
  });
});

describe("deriveFixes", () => {
  it("ranks weak competencies by lowest held-out score inside each severity band", () => {
    const scorecard: Scorecard = {
      ...baseScorecard,
      certified: false,
      pass_at_k: {
        compliance: false,
        fairness: false,
        prompt_injection_resilience: false,
        privacy: false
      },
      competency_scores: {
        compliance: 0.79,
        fairness: 0.58,
        prompt_injection_resilience: 0.31,
        privacy: 0.74
      },
      held_out_scores: {
        compliance: 0.79,
        fairness: 0.58,
        prompt_injection_resilience: 0.31,
        privacy: 0.74
      }
    };

    const fixes = deriveFixes(scorecard, null);

    expect(fixes.map((fix) => fix.id).slice(0, 4)).toEqual([
      "comp-prompt_injection_resilience",
      "comp-fairness",
      "comp-privacy",
      "comp-compliance"
    ]);
  });

  it("does not duplicate a competency fix already named by a hard failure", () => {
    const scorecard: Scorecard = {
      ...baseScorecard,
      certified: false,
      failure_reasons: ["prompt_injection_resilience failed pass^3 on held-out variants"],
      pass_at_k: { prompt_injection_resilience: false },
      competency_scores: { prompt_injection_resilience: 0.25 },
      held_out_scores: { prompt_injection_resilience: 0.25 }
    };

    const fixes = deriveFixes(scorecard, null);

    expect(fixes.map((fix) => fix.id)).toEqual(["fail-0"]);
  });

  it("adds TraceRazor fix patches as info items with token savings", () => {
    const scorecard: Scorecard = {
      ...baseScorecard,
      trace_audit: {
        ...baseScorecard.trace_audit,
        fixes: [
          {
            fix_type: "context_compression",
            target: "system_prompt",
            patch: "Summarise the conversation to the last three relevant facts before each tool call.",
            estimated_token_savings: 330,
            risk: "safe"
          }
        ]
      }
    };
    const fixes = deriveFixes(scorecard, null);
    const traceFix = fixes.find((fix) => fix.id === "trace-fix-0");
    expect(traceFix).toBeDefined();
    expect(traceFix?.severity).toBe("info");
    expect(traceFix?.detail).toMatch(/~330 tokens\/run/);
  });
});

describe("policyRuleSentence", () => {
  it("states the whole gate in one sentence", () => {
    const sentence = policyRuleSentence(policy);
    expect(sentence).toContain("strict policy");
    expect(sentence).toContain("k≥3");
    expect(sentence).toContain("≥80% held-out");
    expect(sentence).toContain("TAS ≥70");
    expect(sentence).toContain("no critical findings");
  });
});

describe("unverified (demo) runs", () => {
  it("maps the backend unverified verdict onto its own band, never ship", () => {
    const decision = {
      verdict: "unverified",
      deployable: false,
      label: "Unverified",
      summary: "Demo run graded by the deterministic mock grader.",
      blocking_reasons: ["Demo run: no model answered, so no tool call was made and no guardrail was exercised."],
      warnings: [],
      critical_findings: [],
      passed_checks: [],
      failed_checks: ["behavioral"],
      metrics: {},
      generated_at: "2026-10-15T00:00:00Z",
      policy: { name: "strict", k: 1, competency_threshold: 0.8, max_transfer_gap: 0.2, tas_threshold: 70, critical_findings_allowed: 0, require_trace: true, allow_degraded: false }
    } as unknown as DeployabilityDecision;
    const verdict = deriveVerdict({ ...baseScorecard, certified: true, behavioral: false }, decision);
    expect(verdict.verdict).toBe("unverified");
    expect(verdict.label).toBe("Demo run, no verdict");
    expect(verdict.headline).toMatch(/Demo run/);
  });

  it("falls back to unverified from the scorecard flag when no decision is attached", () => {
    const verdict = deriveVerdict({ ...baseScorecard, certified: true, behavioral: false }, null);
    expect(verdict.verdict).toBe("unverified");
  });
});
