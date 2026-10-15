import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnnouncerProvider } from "@/components/announcer";
import { HomeClient } from "./HomeClient";
import type { CandidateConfig, WorkspaceBoot } from "@/types/assay";

/**
 * The page composes TanStack Query hooks and the announcer context, so tests
 * render it inside the same hot-path provider stack the real app uses. Retries
 * are disabled so error-state queries settle immediately.
 */
function renderHome(initialBoot: WorkspaceBoot | null = workspaceBootPayload) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <HomeClient initialBoot={initialBoot} />
      </AnnouncerProvider>
    </QueryClientProvider>
  );
}

const candidate: CandidateConfig = {
  id: "cand_demo",
  name: "Demo Candidate",
  adapter_type: "mock",
  metadata: {}
};

const httpCandidate: CandidateConfig = {
  id: "cand_http",
  name: "Webhook Candidate",
  adapter_type: "http",
  endpoint_url: "http://127.0.0.1:9191/ask",
  model: "hr-agent-preview",
  metadata: { source: "web-candidate-dock" }
};

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

const agentSpec = {
  schema: "assay.agent_spec.v1",
  run_id: "run_demo",
  candidate_id: "cand_demo",
  candidate_name: "Demo Candidate",
  exam_pack_id: "hr-v1",
  generated_at: "2026-06-27T00:00:00Z",
  readiness: "ready",
  headline: "Demo Candidate certified pass^3 on held-out variants.",
  agent_markdown: "# Demo Candidate - Operating Notes\n\n## Guardrails\n- Use job-related criteria only.\n",
  strengths: ["Compliance (held-out 96%)"],
  gaps: [],
  tracerazor_actions: ["TraceRazor TAS 88/100 [Good] - passed."],
  sub_agents: [
    {
      id: "trace-auditor",
      name: "Trace Auditor",
      role: "Records reasoning/tool steps and scores token adequacy with TraceRazor.",
      focus: "Token-adequate, auditable traces",
      trigger: "TraceRazor TAS 88 passed; keep auditing token adequacy as volume grows.",
      sprite: "tracerazor",
      priority: "optional",
      tools: ["tracerazor.Tracer", "tracerazor.TraceRazorClient"],
      delegation_rule: "After each run, submit the candidate-only trace to TraceRazor.",
      definition_markdown: "# Trace Auditor\n\nRecords reasoning/tool steps.\n"
    }
  ],
  metrics: { recommended_subagents: 0, optional_subagents: 1, tas_score: 88 }
};

const productReview = {
  schema: "assay.product_review.v1",
  run_id: "run_demo",
  generated_at: "2026-06-27T00:00:00Z",
  reviewers: [
    {
      key: "experience",
      name: "UX reviewer",
      status: "pass",
      label: "clear",
      summary: "Workflow, score, and coaching are visible after the run.",
      evidence: ["2/2 competencies passed."],
      next_step: null,
      sprite: "candidate-document"
    },
    {
      key: "runtime",
      name: "Runtime reviewer",
      status: "pass",
      label: "stable",
      summary: "SQLite storage is responding.",
      evidence: ["Database backend: sqlite."],
      next_step: null,
      sprite: "candidate-shield"
    },
    {
      key: "evidence",
      name: "Evidence reviewer",
      status: "pass",
      label: "passed",
      summary: "Proof bundle, trace events, and audit summary support the result.",
      evidence: ["TraceRazor TAS 88.0."],
      next_step: null,
      sprite: "candidate-approved"
    }
  ]
};

const deployability = {
  schema: "assay.deployability_decision.v1",
  run_id: "run_demo",
  verdict: "ship",
  deployable: true,
  label: "Ship",
  summary: "All strict checks passed.",
  policy: {
    schema: "assay.deployability_policy.v1",
    name: "strict",
    k: 3,
    competency_threshold: 0.8,
    max_transfer_gap: 0.2,
    tas_threshold: 70,
    critical_findings_allowed: 0,
    require_trace: true,
    allow_degraded: false
  },
  blocking_reasons: [],
  warnings: [],
  critical_findings: [],
  passed_checks: ["compliance:pass^k", "fairness:pass^k"],
  failed_checks: [],
  metrics: {},
  generated_at: "2026-06-27T00:00:00Z"
};

const proofBundle = {
  schema: "assay.proof_bundle.v1",
  product: "Assay",
  generated_at: "2026-06-27T00:00:00Z",
  run: runRecord,
  candidate,
  scorecard,
  events,
  summary: {
    status: "completed",
    certified: true,
    certificate_label: "Internal capability bar only",
    tas_score: 88,
    trace_status: "ok",
    event_count: 1
  },
  database: { ok: true, backend: "sqlite" },
  agent_spec: agentSpec,
  product_review: productReview,
  deployability
};

let agentSpecOverride: typeof agentSpec | null = null;
let runCreateBodies: Array<Record<string, unknown>> = [];
let workspaceBootFetches = 0;
let healthFetches = 0;
let runListFetches = 0;
let candidateListFetches = 0;
let candidateSummaryFetches = 0;
let proofDetailFetches = 0;
let payoffFetches = 0;
let traceFetches = 0;
let eventFetches = 0;
// The intake response's exam_available flag; false simulates a server with no model key.
let examAvailable = true;
const NO_MODEL_REASON =
  "The guardrail exam needs a real model to play the agent: set OPENAI_API_KEY on the Assay server.";

const workspaceBootPayload: WorkspaceBoot = {
  schema: "assay.workspace_boot.v1",
  health: { ok: true, tracerazor_importable: true, database_backend: "sqlite", openai_configured: true },
  exam_pack_summaries: [
    {
      id: "guardrail-v1",
      name: "Guardrail prover",
      simulator_model: "assay-sandbox",
      item_count: 2,
      competencies: ["destructive_actions", "injection"]
    }
  ],
  candidate_summaries: [{
    id: candidate.id,
    name: candidate.name,
    adapter_type: candidate.adapter_type
  }]
};

beforeEach(() => {
  agentSpecOverride = null;
  runCreateBodies = [];
  workspaceBootFetches = 0;
  healthFetches = 0;
  runListFetches = 0;
  candidateListFetches = 0;
  candidateSummaryFetches = 0;
  proofDetailFetches = 0;
  payoffFetches = 0;
  traceFetches = 0;
  eventFetches = 0;
  examAvailable = true;
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/workspace/boot")) {
      workspaceBootFetches += 1;
      return json(workspaceBootPayload);
    }
    if (url.endsWith("/health")) {
      healthFetches += 1;
      return json({ ok: true, tracerazor_importable: true, database_backend: "sqlite" });
    }
    if (url.endsWith("/health/database")) {
      return json({ ok: true, backend: "sqlite", tables: { candidates: 1, runs: 0 } });
    }
    if (url.endsWith("/candidates/from-markdown")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      return json({
        candidate: { ...candidate, system_prompt: body.markdown, adapter_type: "openai-compatible" },
        mode: examAvailable ? "live" : "lint-only",
        exam_available: examAvailable,
        exam_unavailable_reason: examAvailable ? null : NO_MODEL_REASON,
        static_lint: {
          schema: "assay.static_lint.v1",
          kind: "static_analysis",
          label: "Static analysis - not a behavioral verdict. Add an OpenAI key to run the guardrail exam.",
          findings: [
            {
              id: "dangerous-tool-delete_user",
              severity: "high",
              title: "Dangerous capability granted: `delete_user`",
              detail: "This tool can take an irreversible action."
            }
          ],
          dangerous_tools: ["delete_user"],
          guardrail_coverage: { destructive: false, injection: false, secrets: false }
        },
        detected: { role: "agent", title: "Demo Agent", tools: ["lookup"], tool_count: 1, token_estimate: 40 }
      });
    }
    if (url.endsWith("/candidates") && init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}"));
      return json({ ...httpCandidate, ...body, id: httpCandidate.id });
    }
    if (url.endsWith("/candidates/summary")) {
      candidateSummaryFetches += 1;
      return json([{
        id: candidate.id,
        name: candidate.name,
        adapter_type: candidate.adapter_type
      }]);
    }
    if (url.endsWith("/candidates")) {
      candidateListFetches += 1;
      return json([candidate]);
    }
    if (url.endsWith("/runs") && init?.method !== "POST") {
      runListFetches += 1;
      return json([runRecord]);
    }
    if (url.endsWith("/runs") && init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}"));
      runCreateBodies.push(body);
      return json({ ...runRecord, status: "created", baseline_run_id: body.baseline_run_id ?? null });
    }
    if (url.endsWith("/runs/run_demo/start")) {
      return json(scorecard);
    }
    if (url.endsWith("/runs/run_demo/events")) {
      eventFetches += 1;
      return json(events);
    }
    if (url.endsWith("/runs/run_demo/trace")) {
      traceFetches += 1;
      return json({ run_id: "run_demo", events, scorecard });
    }
    if (url.endsWith("/runs/run_demo/payoff")) {
      payoffFetches += 1;
      return json({
        schema: "assay.run_payoff.v1",
        run_id: "run_demo",
        agent_spec: agentSpecOverride ?? agentSpec,
        deployability
      });
    }
    if (url.endsWith("/runs/run_demo/detail") || url.endsWith("/runs/run_demo/proof-bundle")) {
      proofDetailFetches += 1;
      return json(agentSpecOverride ? { ...proofBundle, agent_spec: agentSpecOverride } : proofBundle);
    }
    if (url.endsWith("/runs/run_demo/agent-spec/diff")) {
      return json({
        schema: "assay.agent_diff.v1",
        run_id: "run_demo",
        original_available: true,
        from_label: "original/agent.md",
        to_label: "refined/AGENTS.md",
        unified: "--- original/agent.md\n+++ refined/AGENTS.md\n@@ -1,1 +1,2 @@\n # Demo Candidate\n+- Use job-related criteria only.",
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
    if (url.endsWith("/runs/run_demo/agent-spec")) {
      return json(agentSpecOverride ?? agentSpec);
    }
    return json({}, 404);
  }) as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Assay page", () => {
  it("leads with the Assay agent.md intake as the first screen", async () => {
    const { container } = renderHome();
    // Brand now lives in the global TopNav (layout); the page leads with the hero.
    await screen.findByRole("heading", { name: /prove your agent/i });
    // Cold load: the one bright primary is the live sample run, never a disabled button (D3).
    expect(screen.getByRole("button", { name: /see a sample verdict/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /run.*guardrail test/i })).toBeNull();
    expect(screen.getByText(/runs real adversarial attacks/i)).toBeInTheDocument();
    // A starter template is offered as the fallback.
    expect(screen.getByRole("button", { name: /Ops helper \(hardened\)/i })).toBeInTheDocument();
    // Intake accepts structured agent configs, not just markdown.
    const fileInput = container.querySelector('input[type="file"]');
    const accept = fileInput?.getAttribute("accept") ?? "";
    expect(accept).toContain(".json");
    expect(accept).toContain(".yaml");
    expect(accept).toContain(".toml");
    // A server with a model key runs the real exam: no lint-only notice.
    expect(screen.queryByText(/lints the definition only/i)).toBeNull();
    // Zero-input path: a one-click sample verdict + a "see how it works" jump are offered.
    expect(screen.getByRole("button", { name: /see how it works/i })).toBeInTheDocument();
    expect(workspaceBootFetches).toBe(0);
    // The intake path should not fetch historical runs until a workspace route needs them.
    expect(runListFetches).toBe(0);
    // Home first paint is batched into /workspace/boot; these individual reads
    // are still available to workspace routes, but should stay off the hot path.
    expect(healthFetches).toBe(0);
    expect(candidateSummaryFetches).toBe(0);
    expect(candidateListFetches).toBe(0);
  });

  it("runs an uploaded agent.md and lands on a verdict", async () => {
    const user = userEvent.setup();
    renderHome();
    const template = await screen.findByRole("button", { name: /Ops helper \(hardened\)/i });
    await user.click(template);
    const runButton = screen.getByRole("button", { name: /run.*guardrail test/i });
    await waitFor(() => expect(runButton).toBeEnabled());
    await user.click(runButton);
    // Lands on the verdict hero with the ranked "what to fix" list.
    await screen.findByText("What to fix", undefined, { timeout: 10000 });
    expect(screen.getAllByText("Ready to ship").length).toBeGreaterThan(0);
    expect(screen.getByText("Static artifact checks")).toBeInTheDocument();
    expect(screen.getByText("Dangerous capability granted: `delete_user`")).toBeInTheDocument();
    expect(screen.getByText(/By capability/i)).toBeInTheDocument();
    expect(workspaceBootFetches).toBe(0);
    expect(candidateSummaryFetches).toBe(0);
    expect(runListFetches).toBe(0);
    expect(payoffFetches).toBe(1);
    expect(proofDetailFetches).toBe(0);
    expect(traceFetches).toBe(0);
    // The intake's deploy-policy choice rides on the run request.
    expect(runCreateBodies[0]).toMatchObject({
      candidate_id: "cand_demo",
      policy_name: "strict",
      competency_threshold: 0.8
    });

    const eventFetchesBeforeTrace = eventFetches;
    await user.click(screen.getByRole("button", { name: /open full trace/i }));
    await waitFor(() => expect(eventFetches).toBeGreaterThan(eventFetchesBeforeTrace));
    expect(traceFetches).toBe(0);
    expect(proofDetailFetches).toBe(0);
  }, 15000);

  it("says up front that a server without a model key can only lint", async () => {
    const { container } = renderHome({
      ...workspaceBootPayload,
      health: { ...workspaceBootPayload.health, openai_configured: false }
    });
    await screen.findByRole("heading", { name: /prove your agent/i });
    expect(screen.getByText(/lints the definition only/i)).toBeInTheDocument();
    const actions = within(container.querySelector(".assay-intake-actions") as HTMLElement);
    expect(actions.getByRole("button", { name: /lint the sample agent/i })).toBeEnabled();
    expect(actions.queryByRole("button", { name: /see a sample verdict/i })).toBeNull();
  });

  it("shows the lint and the reason, and starts no run, when the exam is unavailable", async () => {
    const user = userEvent.setup();
    examAvailable = false;
    renderHome({ ...workspaceBootPayload, health: { ...workspaceBootPayload.health, openai_configured: false } });
    const template = await screen.findByRole("button", { name: /Ops helper \(hardened\)/i });
    await user.click(template);
    const lintButton = screen.getByRole("button", { name: /lint the definition/i });
    await waitFor(() => expect(lintButton).toBeEnabled());
    await user.click(lintButton);

    await screen.findByText(/lint only - the guardrail exam did not run/i);
    expect(screen.getByText(NO_MODEL_REASON)).toBeInTheDocument();
    expect(screen.getByText("Dangerous capability granted: `delete_user`")).toBeInTheDocument();
    expect(runCreateBodies).toHaveLength(0);
    expect(screen.queryByText("What to fix")).toBeNull();

    await user.click(screen.getByRole("button", { name: /back to start/i }));
    await screen.findByRole("heading", { name: /prove your agent/i });
  });

  it("uses the current run as the baseline when testing the improved version", async () => {
    const user = userEvent.setup();
    renderHome();
    const template = await screen.findByRole("button", { name: /Ops helper \(hardened\)/i });
    await user.click(template);
    const runButton = screen.getByRole("button", { name: /run.*guardrail test/i });
    await waitFor(() => expect(runButton).toBeEnabled());
    await user.click(runButton);
    await screen.findByText("What to fix", undefined, { timeout: 10000 });

    await user.click(screen.getByRole("button", { name: /test improved version/i }));

    await waitFor(() => expect(runCreateBodies).toHaveLength(2));
    expect(workspaceBootFetches).toBe(0);
    expect(candidateSummaryFetches).toBe(0);
    expect(runListFetches).toBe(0);
    expect(runCreateBodies[1]).toMatchObject({
      candidate_id: "cand_demo",
      exam_pack_id: "guardrail-v1",
      baseline_run_id: "run_demo"
    });
  }, 20000);

});

function json(payload: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" }
    })
  );
}
