import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";

const pushMock = vi.hoisted(() => vi.fn());
const queryMocks = vi.hoisted(() => ({
  useRunSummaries: vi.fn(() => ({ data: [] })),
  useExamPacks: vi.fn(() => ({ data: [] })),
  useCandidateSummaries: vi.fn(() => ({ data: [] }))
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock })
}));

vi.mock("@/lib/queries", () => ({
  useRunSummaries: queryMocks.useRunSummaries,
  useExamPacks: queryMocks.useExamPacks,
  useCandidateSummaries: queryMocks.useCandidateSummaries
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
    queryMocks.useExamPacks.mockClear();
    queryMocks.useCandidateSummaries.mockClear();
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
    expect(queryMocks.useExamPacks).toHaveBeenLastCalledWith({ enabled: false });
    expect(queryMocks.useCandidateSummaries).toHaveBeenLastCalledWith({ enabled: false });

    fireEvent(window, new Event("assay:open-cmdk"));

    await waitFor(() => expect(queryMocks.useRunSummaries).toHaveBeenLastCalledWith({ enabled: true }));
    expect(queryMocks.useExamPacks).toHaveBeenLastCalledWith({ enabled: true });
    expect(queryMocks.useCandidateSummaries).toHaveBeenLastCalledWith({ enabled: true });
  });

  it("shows an empty state for unmatched filters", async () => {
    renderWithClient(<CommandPalette />);

    fireEvent(window, new Event("assay:open-cmdk"));
    const input = await screen.findByRole("textbox", { name: /command palette search/i });
    fireEvent.change(input, { target: { value: "zzzz-no-match" } });

    expect(screen.getByText(/no matches for/i)).toBeInTheDocument();
  });
});
