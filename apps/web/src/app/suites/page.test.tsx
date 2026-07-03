import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SuitesPage from "./page";

const serverMocks = vi.hoisted(() => ({
  getExamPackSummaries: vi.fn(() =>
    Promise.resolve([
      {
        id: "support-triage-v1",
        name: "Support triage reliability",
        simulator_model: "assay-deterministic-sim-v1",
        item_count: 3,
        competencies: ["tool_use", "handoff_quality"]
      }
    ])
  )
}));

vi.mock("@/lib/serverApi", () => ({
  getExamPackSummaries: serverMocks.getExamPackSummaries
}));

vi.mock("./SuiteActions", () => ({
  SuiteImportControl: ({ count }: { count: number }) => <span>{count} suite</span>,
  SuiteExportButton: ({ packId }: { packId: string }) => <button type="button">Export {packId}</button>
}));

describe("SuitesPage", () => {
  it("renders API-provided suite summaries without client-side list fetching", async () => {
    render(await SuitesPage());

    expect(serverMocks.getExamPackSummaries).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Test suites" })).toBeInTheDocument();
    expect(screen.getByText("Support triage reliability")).toBeInTheDocument();
    expect(screen.getByText("support-triage-v1")).toBeInTheDocument();
    expect(screen.getByText("3 probes")).toBeInTheDocument();
    expect(screen.getByText("2 competencies")).toBeInTheDocument();
    expect(screen.getByText("Tool Use")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export support-triage-v1" })).toBeInTheDocument();
  });
});
