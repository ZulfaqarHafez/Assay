import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImprovePanel } from "./ImprovePanel";
import type { AgentSpec } from "@/types/assay";

const agentSpec: AgentSpec = {
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
  strengths: ["Compliance"],
  gaps: [],
  tracerazor_actions: [],
  sub_agents: [],
  metrics: {}
};

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ImprovePanel agentSpec={agentSpec} agentName="Demo Candidate" runId="run_demo" />
    </QueryClientProvider>
  );
}

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  }));
}

describe("ImprovePanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the exact diff only after the user asks for it", async () => {
    const paths: string[] = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      paths.push(url.pathname);
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

    renderPanel();

    expect(paths).not.toContain("/runs/run_demo/agent-spec/diff");
    fireEvent.click(screen.getByRole("button", { name: /exact diff/i }));

    await waitFor(() => expect(paths).toContain("/runs/run_demo/agent-spec/diff"));
    await waitFor(() => expect(screen.getByText("+1")).toBeInTheDocument());
    expect(screen.getByLabelText(/diff against the uploaded agent\.md/i)).toHaveTextContent(
      "+ - Use job-related criteria only."
    );
  });
});
