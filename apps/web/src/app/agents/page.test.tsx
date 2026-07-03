import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AgentsPage from "./page";

const queryMocks = vi.hoisted(() => ({
  useAgentSummaries: vi.fn(() => ({
    isLoading: false,
    data: [
      {
        name: "Support Triage Agent",
        candidate_id: "cand_support",
        adapter_type: "mock",
        run_count: 3,
        latest_run_id: "run_latest",
        verdict: "ship",
        score: "5/5"
      }
    ]
  }))
}));

vi.mock("@/lib/queries", () => ({
  useAgentSummaries: queryMocks.useAgentSummaries
}));

describe("AgentsPage", () => {
  it("renders the API-provided agent rollup without client-side fanout", () => {
    render(<AgentsPage />);

    expect(queryMocks.useAgentSummaries).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Agents" })).toBeInTheDocument();
    expect(screen.getByText("Support Triage Agent")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5/5")).toBeInTheDocument();
    expect(screen.getByText("Ship")).toBeInTheDocument();
  });
});
