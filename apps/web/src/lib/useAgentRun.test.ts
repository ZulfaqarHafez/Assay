import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentRun } from "./useAgentRun";

const mockApi = vi.hoisted(() => ({
  candidateFromMarkdown: vi.fn(),
  createRun: vi.fn(),
  examPacks: vi.fn(),
  examPackSummaries: vi.fn()
}));

const mockRunStream = vi.hoisted(() => ({
  error: null as string | null,
  reset: vi.fn(),
  scorecard: null,
  start: vi.fn(),
  status: "idle"
}));

vi.mock("@/lib/api", () => ({
  assayApi: mockApi
}));

vi.mock("@/lib/useRunStream", () => ({
  useRunStream: () => mockRunStream
}));

describe("useAgentRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunStream.error = null;
    mockRunStream.scorecard = null;
    mockRunStream.status = "idle";
    mockApi.examPackSummaries.mockResolvedValue([
      {
        id: "hr-v1",
        name: "HR screening reliability",
        simulator_model: "assay-deterministic-sim-v1",
        item_count: 5,
        competencies: ["compliance"]
      }
    ]);
    mockApi.createRun.mockResolvedValue({
      id: "run_1",
      candidate_id: "cand_1",
      exam_pack_id: "hr-v1",
      status: "created",
      k: 3,
      competency_threshold: 0.8,
      max_transfer_gap: 0.2,
      tas_threshold: 70
    });
  });

  it("uses slim exam pack summaries for rerun progress metadata", async () => {
    const { result } = renderHook(() => useAgentRun());

    let runId: string | null = null;
    await act(async () => {
      runId = await result.current.rerun("cand_1", "hr-v1");
    });

    expect(runId).toBe("run_1");
    expect(mockApi.createRun).toHaveBeenCalledWith("cand_1", "hr-v1", null);
    expect(mockApi.examPackSummaries).toHaveBeenCalledTimes(1);
    expect(mockApi.examPacks).not.toHaveBeenCalled();
    expect(mockRunStream.start).toHaveBeenCalledWith("run_1", { k: 3, itemCount: 5 });
  });

  it("reuses cached summary metadata when testing an improved agent", async () => {
    mockApi.candidateFromMarkdown.mockResolvedValue({
      candidate: {
        id: "cand_2",
        name: "Improved agent",
        adapter_type: "openai-compatible"
      },
      mode: "live",
      detected: {
        role: "support",
        title: "Support agent",
        tools: [],
        tool_count: 0,
        token_estimate: 42
      }
    });
    const { result } = renderHook(() => useAgentRun());

    await act(async () => {
      await result.current.rerun("cand_1", "hr-v1");
      await result.current.testImproved("# Agent", "Improved agent", "hr-v1", "run_base");
    });

    expect(mockApi.examPackSummaries).toHaveBeenCalledTimes(1);
    expect(mockApi.examPacks).not.toHaveBeenCalled();
    expect(mockRunStream.start).toHaveBeenLastCalledWith("run_1", { k: 3, itemCount: 5 });
    expect(mockApi.createRun).toHaveBeenLastCalledWith("cand_2", "hr-v1", null, "run_base");
  });
});
