import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentRunControls from "./AgentRunControls";

const mocks = vi.hoisted(() => ({
  agentSpec: vi.fn(),
  push: vi.fn(),
  rerun: vi.fn(),
  testImproved: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push })
}));

vi.mock("@/lib/api", () => ({
  assayApi: {
    agentSpec: mocks.agentSpec
  }
}));

vi.mock("@/lib/useAgentRun", () => ({
  useAgentRun: () => ({
    runStream: {
      totalExpected: 0,
      gradedCount: 0,
      status: "idle",
      scorecard: null
    },
    isRunning: false,
    error: null,
    rerun: mocks.rerun,
    testImproved: mocks.testImproved
  })
}));

describe("AgentRunControls", () => {
  beforeEach(() => {
    mocks.agentSpec.mockReset();
    mocks.push.mockReset();
    mocks.rerun.mockReset();
    mocks.testImproved.mockReset();
  });

  it("loads the refined agent spec only when the improved-version action is clicked", async () => {
    mocks.agentSpec.mockResolvedValue({ agent_markdown: "# Refined Support Agent" });
    mocks.testImproved.mockResolvedValue({ runId: "run_new", candidateId: "cand_new" });

    render(
      <AgentRunControls
        candidateId="cand_support"
        agentName="Support Agent"
        examPackId="support-v1"
        baselineRunId="run_latest"
        refinedRunId="run_latest"
      />
    );

    expect(mocks.agentSpec).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /test improved version/i }));

    await waitFor(() => expect(mocks.agentSpec).toHaveBeenCalledWith("run_latest"));
    expect(mocks.testImproved).toHaveBeenCalledWith(
      "# Refined Support Agent",
      "Support Agent v2",
      "support-v1",
      "run_latest"
    );
  });
});
