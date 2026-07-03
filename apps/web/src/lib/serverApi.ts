import type { AgentSummary, ExamPackSummary, RunSummary } from "@/types/assay";

function serverApiBaseUrl() {
  return (
    process.env.ASSAY_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://127.0.0.1:8000"
  );
}

async function serverRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${serverApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...Object.fromEntries(new Headers(init?.headers))
    },
    next: { revalidate: 30 }
  } as RequestInit & { next: { revalidate: number } });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export function getRunSummaries() {
  return serverRequest<RunSummary[]>("/runs/summary");
}

export function getAgentSummaries() {
  return serverRequest<AgentSummary[]>("/agents/summary");
}

export function getExamPackSummaries() {
  return serverRequest<ExamPackSummary[]>("/exam-packs/summary");
}
