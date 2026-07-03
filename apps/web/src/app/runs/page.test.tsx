import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ExperimentsPage from "./page";

const queryMocks = vi.hoisted(() => ({
  useRunSummaries: vi.fn(() => ({
    isLoading: false,
    data: [
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
    ]
  }))
}));

vi.mock("@/lib/queries", () => ({
  useRunSummaries: queryMocks.useRunSummaries
}));

describe("ExperimentsPage", () => {
  it("renders API-provided run rows without a candidate summary fanout", () => {
    render(<ExperimentsPage />);

    expect(queryMocks.useRunSummaries).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Experiments" })).toBeInTheDocument();
    expect(screen.getByText("Support Triage Agent")).toBeInTheDocument();
    expect(screen.getByText("support-triage-v1")).toBeInTheDocument();
    expect(screen.getByText("5/5")).toBeInTheDocument();
    expect(screen.getByText("3x")).toBeInTheDocument();
    expect(screen.getByText("Ship")).toBeInTheDocument();
  });
});
