import { afterEach, describe, expect, it, vi } from "vitest";
import { assayApi } from "./api";

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  }));
}

describe("assayApi request headers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("keeps GET reads as simple cross-origin requests", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.assay.test");
    const fetchMock = vi.fn(async () => json([]));
    global.fetch = fetchMock;

    await assayApi.runs();

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.has("Content-Type")).toBe(false);
  });

  it("uses slim summary endpoints for workspace list views", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.assay.test");
    const fetchMock = vi.fn(async () => json([]));
    global.fetch = fetchMock;

    await assayApi.runSummaries();
    await assayApi.candidateSummaries();

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.assay.test/runs/summary");
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.assay.test/candidates/summary");
  });

  it("uses the workspace boot endpoint for home first paint", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.assay.test");
    const fetchMock = vi.fn(async () => json({ schema: "assay.workspace_boot.v1" }));
    global.fetch = fetchMock;

    await assayApi.workspaceBoot();

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.assay.test/workspace/boot");
  });

  it("reads a single run without assembling a proof bundle", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.assay.test");
    const fetchMock = vi.fn(async () => json({ id: "run_1" }));
    global.fetch = fetchMock;

    await assayApi.run("run_1");

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.assay.test/runs/run_1");
  });

  it("uses the slim verdict endpoint for run-detail first paint", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.assay.test");
    const fetchMock = vi.fn(async () => json({ schema: "assay.run_verdict.v1" }));
    global.fetch = fetchMock;

    await assayApi.runVerdict("run_1");

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.assay.test/runs/run_1/verdict");
  });

  it("uses the bundled run surfaces endpoint for secondary run-detail panels", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.assay.test");
    const fetchMock = vi.fn(async () => json({ schema: "assay.run_surfaces.v1" }));
    global.fetch = fetchMock;

    await assayApi.runSurfaces("run_1");

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.assay.test/runs/run_1/surfaces");
  });

  it("adds JSON content type for mutation bodies", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.assay.test");
    const fetchMock = vi.fn(async () => json({ id: "run_1" }));
    global.fetch = fetchMock;

    await assayApi.createRun("cand_1");

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(init?.method).toBe("POST");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("uses the fast run detail endpoint by default", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.assay.test");
    const fetchMock = vi.fn(async () => json({ schema: "assay.proof_bundle.v1" }));
    global.fetch = fetchMock;

    await assayApi.proofBundle("run_1");

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.assay.test/runs/run_1/detail");
  });

  it("keeps the full proof bundle endpoint for exports", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.assay.test");
    const fetchMock = vi.fn(async () => json({ schema: "assay.proof_bundle.v1" }));
    global.fetch = fetchMock;

    await assayApi.proofBundle("run_1", "full");

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.assay.test/runs/run_1/proof-bundle");
  });
});
