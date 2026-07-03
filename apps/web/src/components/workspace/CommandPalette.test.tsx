import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";
import type { ExamPackSummary, RunSummary } from "@/types/assay";

const pushMock = vi.hoisted(() => vi.fn());
const queryMocks = vi.hoisted(() => ({
  useRunSummaries: vi.fn(() => ({ data: [] as RunSummary[] })),
  useExamPackSummaries: vi.fn(() => ({ data: [] as ExamPackSummary[] }))
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock })
}));

vi.mock("@/lib/queries", () => ({
  useRunSummaries: queryMocks.useRunSummaries,
  useExamPackSummaries: queryMocks.useExamPackSummaries
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("CommandPalette", () => {
  afterEach(() => {
    pushMock.mockReset();
    queryMocks.useRunSummaries.mockClear();
    queryMocks.useExamPackSummaries.mockClear();
  });

  it("opens with Ctrl-K, filters commands, and navigates on Enter", async () => {
    renderWithClient(<CommandPalette />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByRole("textbox", { name: /command palette search/i });
    fireEvent.change(input, { target: { value: "suites" } });
    await screen.findByText("Suites");
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/suites"));
  });

  it("defers dynamic index queries until the palette opens", async () => {
    renderWithClient(<CommandPalette />);

    expect(queryMocks.useRunSummaries).toHaveBeenLastCalledWith({ enabled: false });
    expect(queryMocks.useExamPackSummaries).toHaveBeenLastCalledWith({ enabled: false });

    fireEvent(window, new Event("assay:open-cmdk"));

    await waitFor(() => expect(queryMocks.useRunSummaries).toHaveBeenLastCalledWith({ enabled: true }));
    expect(queryMocks.useExamPackSummaries).toHaveBeenLastCalledWith({ enabled: true });
  });

  it("can lazy-mount already open while delegating the shortcut listener", async () => {
    renderWithClient(<CommandPalette initialOpen listenForShortcut={false} />);

    expect(await screen.findByRole("textbox", { name: /command palette search/i })).toBeInTheDocument();
    expect(queryMocks.useRunSummaries).toHaveBeenLastCalledWith({ enabled: true });

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /command palette/i })).not.toBeInTheDocument());

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.queryByRole("dialog", { name: /command palette/i })).not.toBeInTheDocument();

    fireEvent(window, new Event("assay:open-cmdk"));
    expect(await screen.findByRole("textbox", { name: /command palette search/i })).toBeInTheDocument();
  });

  it("uses run summary candidate names without a candidate fanout query", async () => {
    queryMocks.useRunSummaries.mockReturnValue({
      data: [
        {
          id: "run_support",
          candidate_id: "cand_support",
          candidate_name: "Support Triage Agent",
          exam_pack_id: "support-triage-v1",
          source_pack_id: null,
          status: "completed",
          k: 1,
          baseline_run_id: null,
          certified: true,
          pass_count: 1,
          total_count: 1,
          degraded: false,
          qualification_status: "deterministic",
          role_brief_summary: null
        }
      ]
    });

    renderWithClient(<CommandPalette />);
    fireEvent(window, new Event("assay:open-cmdk"));

    expect(await screen.findByText("Support Triage Agent")).toBeInTheDocument();
    expect(screen.getByText("run_support - support-triage-v1")).toBeInTheDocument();
  });

  it("shows an empty state for unmatched filters", async () => {
    renderWithClient(<CommandPalette />);

    fireEvent(window, new Event("assay:open-cmdk"));
    const input = await screen.findByRole("textbox", { name: /command palette search/i });
    fireEvent.change(input, { target: { value: "zzzz-no-match" } });

    expect(screen.getByText(/no matches for/i)).toBeInTheDocument();
  });
});
