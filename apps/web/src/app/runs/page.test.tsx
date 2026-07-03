import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ExperimentsPage from "./page";

const serverMocks = vi.hoisted(() => ({
  getRunSummaries: vi.fn(() =>
    Promise.resolve([
      {
        id: "run_support",
        candidate_id: "cand_support",
        candidate_name: "Support Triage Agent",
        exam_pack_id: "support-triage-v1",
        status: "completed",
        k: 3,
        certified: true,
        pass_count: 5,
        total_count: 5
      }
    ])
  )
}));

vi.mock("@/lib/serverApi", () => ({
  getRunSummaries: serverMocks.getRunSummaries
}));

describe("ExperimentsPage", () => {
  it("renders API-provided run rows without a candidate summary fanout", async () => {
    render(await ExperimentsPage());

    expect(serverMocks.getRunSummaries).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Experiments" })).toBeInTheDocument();
    expect(screen.getByText("Support Triage Agent")).toBeInTheDocument();
    expect(screen.getByText("support-triage-v1")).toBeInTheDocument();
    expect(screen.getByText("5/5")).toBeInTheDocument();
    expect(screen.getByText("3x")).toBeInTheDocument();
    expect(screen.getByText("Ship")).toBeInTheDocument();
  });
});
