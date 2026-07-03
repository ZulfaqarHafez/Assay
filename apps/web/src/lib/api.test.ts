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
});
