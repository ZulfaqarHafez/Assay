import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AgentsPage from "./page";

const serverMocks = vi.hoisted(() => ({
  getAgentSummaries: vi.fn(() =>
    Promise.resolve([
      {
        name: "Support Triage Agent",
        candidate_id: "cand_support",
        adapter_type: "mock",
        run_count: 3,
        latest_run_id: "run_latest",
        verdict: "ship",
        score: "5/5"
      }
    ])
  )
}));

vi.mock("@/lib/serverApi", () => ({
  getAgentSummaries: serverMocks.getAgentSummaries
}));

describe("AgentsPage", () => {
  it("renders the API-provided agent rollup without client-side fanout", async () => {
    render(await AgentsPage());

    expect(serverMocks.getAgentSummaries).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Agents" })).toBeInTheDocument();
    expect(screen.getByText("Support Triage Agent")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5/5")).toBeInTheDocument();
    expect(screen.getByText("Ship")).toBeInTheDocument();
  });
});
