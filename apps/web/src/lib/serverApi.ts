import type {
  AgentHomeSummary,
  AgentSummary,
  ExamPackSummary,
  RunSummary,
  RunVerdict,
  WorkspaceBoot
} from "@/types/assay";

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

export function getRunVerdict(runId: string) {
  return serverRequest<RunVerdict>(`/runs/${encodeURIComponent(runId)}/verdict`);
}

export function getAgentSummaries() {
  return serverRequest<AgentSummary[]>("/agents/summary");
}

export function getAgentHome(candidateId: string) {
  return serverRequest<AgentHomeSummary>(
    `/agents/${encodeURIComponent(candidateId)}/home?include_agent_markdown=false`
  );
}

export function getExamPackSummaries() {
  return serverRequest<ExamPackSummary[]>("/exam-packs/summary");
}

export function getWorkspaceBoot() {
  return serverRequest<WorkspaceBoot>("/workspace/boot?profile=summary&candidate_limit=24");
}
