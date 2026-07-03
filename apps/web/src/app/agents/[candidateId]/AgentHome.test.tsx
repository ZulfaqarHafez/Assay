import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AgentHome from "./AgentHome";

const queryMocks = vi.hoisted(() => ({
  useAgentHome: vi.fn(() => ({
    isLoading: false,
    isError: false,
    error: null,
    data: {
      schema: "assay.agent_home.v1",
      candidate: {
        id: "cand_support",
        name: "Support Triage Agent",
        adapter_type: "mock",
        created_at: "2026-07-03T00:00:00Z"
      },
      runs: [
        {
          id: "run_latest",
          candidate_id: "cand_support",
          candidate_name: "Support Triage Agent",
          exam_pack_id: "support-triage-v1",
          status: "completed",
          k: 3,
          certified: true,
          pass_count: 5,
          total_count: 5,
          created_at: "2026-07-03T00:00:00Z"
        }
      ],
      latest_agent_markdown: null
    }
  }))
}));

vi.mock("@/lib/queries", () => ({
  useAgentHome: queryMocks.useAgentHome
}));

vi.mock("@/components/assay/AgentRunControls", () => ({
  default: ({
    baselineRunId,
    refinedMarkdown,
    refinedRunId
  }: {
    baselineRunId?: string | null;
    refinedMarkdown?: string | null;
    refinedRunId?: string | null;
  }) => (
    <div data-testid="agent-run-controls">
      {JSON.stringify({ baselineRunId, refinedMarkdown, refinedRunId })}
    </div>
  )
}));

describe("AgentHome", () => {
  it("renders a candidate-scoped home payload without workspace-wide fanout", () => {
    render(<AgentHome candidateId="cand_support" />);

    expect(queryMocks.useAgentHome).toHaveBeenCalledWith("cand_support");
    expect(screen.getByRole("heading", { name: "Support Triage Agent" })).toBeInTheDocument();
    expect(screen.getByText("run_latest")).toBeInTheDocument();
    expect(screen.getByText("5/5")).toBeInTheDocument();
    expect(screen.getByText("Ship")).toBeInTheDocument();
    expect(screen.getByTestId("agent-run-controls")).toHaveTextContent(
      JSON.stringify({ baselineRunId: "run_latest", refinedMarkdown: null, refinedRunId: "run_latest" })
    );
  });
});
