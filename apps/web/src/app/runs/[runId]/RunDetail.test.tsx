import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import RunDetail from "./RunDetail";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
}));

function renderRunDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NuqsTestingAdapter>
        <RunDetail runId="run_demo" />
      </NuqsTestingAdapter>
    </QueryClientProvider>
  );
}

const scorecard = {
  run_id: "run_demo",
  status: "completed",
  certified: true,
  certificate_label: "Internal capability bar only",
  k: 3,
  thresholds: { competency: 0.8, max_transfer_gap: 0.2, tas: 70 },
  simulator_model: "assay-deterministic-sim-v1",
  pass_at_k: { compliance: true, fairness: true },
  competency_scores: { compliance: 0.96, fairness: 0.94 },
  seen_scores: { compliance: 0.96, fairness: 0.94 },
  held_out_scores: { compliance: 0.96, fairness: 0.94 },
  transfer_gap: { compliance: 0, fairness: 0 },
  grader_disagreement: 0.04,
  trace_audit: {
    status: "ok",
    trace_id: "trace_demo",
    tas_score: 88,
    grade: "Good",
    passes: true,
    total_steps: 8,
    total_tokens: 1200,
    metrics: {},
    savings: {},
    fixes: []
  },
  failure_reasons: [],
  created_at: "2026-06-27T00:00:00Z"
};

const runRecord = {
  id: "run_demo",
  candidate_id: "cand_demo",
  exam_pack_id: "hr-v1",
  status: "completed",
  k: 3,
  competency_threshold: 0.8,
  max_transfer_gap: 0.2,
  tas_threshold: 70,
  created_at: "2026-06-27T00:00:00Z",
  updated_at: "2026-06-27T00:00:00Z"
};

const candidate = {
  id: "cand_demo",
  name: "Demo Candidate",
  adapter_type: "mock",
  metadata: {}
};

const events = [
  {
    span_id: "span_1",
    run_id: "run_demo",
    sequence: 1,
    actor: "candidate",
    event_type: "candidate_answered",
    payload: { competency: "compliance" },
    started_at: "2026-06-27T00:00:00Z",
    tracerazor_step_id: 1
  }
];

const deployability = {
  schema: "assay.deployability_decision.v1",
  run_id: "run_demo",
  verdict: "ship",
  label: "Ship",
  deployable: true,
  summary: "All strict checks passed.",
  policy: {
    schema: "assay.deployability_policy.v1",
    name: "strict",
    competency_threshold: 0.8,
    max_transfer_gap: 0.2,
    tas_threshold: 70,
    require_trace: true,
    allow_degraded: false
  },
  passed_checks: ["compliance:pass^k"],
  failed_checks: [],
  blocking_reasons: [],
  warnings: []
};

const agentSpec = {
  schema: "assay.agent_spec.v1",
  run_id: "run_demo",
  candidate_id: "cand_demo",
  candidate_name: "Demo Candidate",
  exam_pack_id: "hr-v1",
  generated_at: "2026-06-27T00:00:00Z",
  readiness: "ready",
  headline: "Demo Candidate certified pass^3 on held-out variants.",
  agent_markdown: "# Demo Candidate\n\n- Use job-related criteria only.\n",
  original_markdown: "# Demo Candidate\n",
  strengths: ["Compliance (held-out 96%)"],
  gaps: [],
  tracerazor_actions: [],
  sub_agents: [],
  metrics: {}
};

const proofBundle = {
  schema: "assay.proof_bundle.v1",
  product: "Assay",
  tenant_id: "local",
  generated_at: "2026-06-27T00:00:00Z",
  run: runRecord,
  candidate,
  scorecard,
  events,
  role_brief: null,
  tailored_exam_pack: null,
  summary: {
    status: "completed",
    certified: true,
    deployable: true,
    deployability_label: "Ship",
    certificate_label: "Internal capability bar only",
    tas_score: 88,
    trace_status: "ok",
    qualification_status: "deterministic",
    event_count: 1
  },
  deployability,
  product_review: {
    schema: "assay.product_review.v1",
    run_id: "run_demo",
    generated_at: "2026-06-27T00:00:00Z",
    reviewers: []
  },
  database: { backend: "sqlite", ok: true },
  connectors: [],
  connector_probes: [],
  agent_spec: agentSpec,
  role_analysis: null,
  candidate_progress: {
    schema: "assay.candidate_progress.v1",
    candidate_id: "cand_demo",
    candidate_name: "Demo Candidate",
    run_count: 1,
    pass_rate: 1,
    competencies: [],
    runs: [runRecord],
    active_lessons: 0
  },
  diagnostic_library: []
};

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  }));
}

describe("RunDetail query fanout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("boots from fast verdict endpoints and avoids bundle-backed duplicate reads", async () => {
    const user = userEvent.setup();
    const paths: string[] = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      paths.push(url.pathname);
      if (url.pathname === "/runs/run_demo/verdict") {
        return json({
          schema: "assay.run_verdict.v1",
          run: runRecord,
          candidate,
          scorecard,
          deployability
        });
      }
      if (url.pathname === "/runs/run_demo/surfaces") {
        return json({
          schema: "assay.run_surfaces.v1",
          run_id: "run_demo",
          agent_spec: agentSpec,
          product_review: proofBundle.product_review,
          candidate_progress: proofBundle.candidate_progress,
          diagnostic_library: []
        });
      }
      if (url.pathname === "/runs/run_demo/agent-spec/diff") {
        return json({
          schema: "assay.agent_diff.v1",
          run_id: "run_demo",
          original_available: true,
          from_label: "original/agent.md",
          to_label: "refined/AGENTS.md",
          unified: "--- original/agent.md\n+++ refined/AGENTS.md",
          hunks: [
            {
              header: "@@ -1,1 +1,2 @@",
              lines: [
                { op: " ", text: "# Demo Candidate" },
                { op: "+", text: "- Use job-related criteria only." }
              ]
            }
          ],
          added: 1,
          removed: 0
        });
      }
      return Promise.resolve(new Response("not mocked", { status: 404 }));
    });

    renderRunDetail();

    await screen.findByText("Demo Candidate");
    await waitFor(() => expect(paths).toContain("/runs/run_demo/verdict"));

    expect(paths).not.toContain("/runs/run_demo");
    expect(paths).not.toContain("/runs/run_demo/scorecard");
    expect(paths).not.toContain("/runs/run_demo/deployability");
    expect(paths).not.toContain("/candidates/summary");
    expect(paths).not.toContain("/runs/run_demo/detail");
    expect(paths).not.toContain("/runs/run_demo/proof-bundle");
    expect(paths).not.toContain("/runs/run_demo/agent-spec/diff");
    expect(paths).not.toContain("/runs/run_demo/trace");
    expect(paths).not.toContain("/runs/run_demo/comparison");
    expect(paths).not.toContain("/exam-packs");

    await screen.findByRole("button", { name: /exact diff/i }, { timeout: 10000 });
    expect(paths).toContain("/runs/run_demo/surfaces");
    expect(paths).not.toContain("/runs/run_demo/agent-spec");
    expect(paths).not.toContain("/runs/run_demo/reviewers");
    expect(paths).not.toContain("/candidates/cand_demo/progress");
    expect(paths).not.toContain("/candidates/cand_demo/lessons");
    expect(paths).not.toContain("/runs/run_demo/detail");
    expect(paths).not.toContain("/runs/run_demo/proof-bundle");

    await user.click(screen.getByRole("button", { name: /exact diff/i }));
    await waitFor(() => expect(paths).toContain("/runs/run_demo/agent-spec/diff"));
  }, 15000);
});
