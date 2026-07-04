import type {
  AgentDiff,
  AgentIntakeResponse,
  AgentSpec,
  CandidateConfig,
  CandidateProgress,
  CandidateSummary,
  DatabaseHealth,
  DeployabilityDecision,
  DiagnosticLesson,
  Health,
  JobScope,
  ProofBundle,
  RunComparison,
  RunEvent,
  RunPayoff,
  RunRecord,
  RunSummary,
  RunSurfaces,
  RunVerdict,
  Scorecard,
  TracePayload,
  WorkspaceBoot
} from "@/types/assay";

export function apiBaseUrl() {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  if (typeof window !== "undefined") {
    const port = Number(window.location.port);
    const isLocal = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
    if (isLocal && Number.isFinite(port) && port >= 3000 && port < 4000) {
      return `${window.location.protocol}//${window.location.hostname}:${port + 5000}`;
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXT_PUBLIC_API_BASE_URL must be configured for the production web app.");
    }
  }
  return "http://127.0.0.1:8000";
}

function pathSegment(value: string) {
  return encodeURIComponent(value);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: requestHeaders(init)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return response.json() as Promise<T>;
}

function requestHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  const method = (init?.method ?? "GET").toUpperCase();
  if (init?.body != null && method !== "GET" && method !== "HEAD" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

export const assayApi = {
  workspaceBoot: () => request<WorkspaceBoot>("/workspace/boot?profile=summary&candidate_limit=24"),
  health: () => request<Health>("/health"),
  databaseHealth: () => request<DatabaseHealth>("/health/database"),
  candidates: () => request<CandidateConfig[]>("/candidates"),
  candidateSummaries: () => request<CandidateSummary[]>("/candidates/summary"),
  runs: () => request<RunRecord[]>("/runs"),
  runSummaries: () => request<RunSummary[]>("/runs/summary"),
  run: (runId: string) => request<RunRecord>(`/runs/${pathSegment(runId)}`),
  runVerdict: (runId: string) => request<RunVerdict>(`/runs/${pathSegment(runId)}/verdict`),
  runSurfaces: (runId: string) => request<RunSurfaces>(`/runs/${pathSegment(runId)}/surfaces`),
  runPayoff: (runId: string) => request<RunPayoff>(`/runs/${pathSegment(runId)}/payoff`),
  createCandidate: (candidate: Partial<CandidateConfig>) =>
    request<CandidateConfig>("/candidates", {
      method: "POST",
      body: JSON.stringify(candidate)
    }),
  candidateFromMarkdown: (markdown: string, name?: string | null, filename?: string | null) =>
    request<AgentIntakeResponse>("/candidates/from-markdown", {
      method: "POST",
      body: JSON.stringify(
        filename
          ? { content: markdown, filename, name: name ?? null }
          : { markdown, name: name ?? null }
      )
    }),
  createRun: (
    candidateId: string,
    examPackId = "hr-v1",
    jobScope: JobScope | null = null,
    baselineRunId: string | null = null,
    options: { policyName?: "strict" | "advisory"; competencyThreshold?: number } = {}
  ) =>
    request<RunRecord>("/runs", {
      method: "POST",
      body: JSON.stringify({
        candidate_id: candidateId,
        exam_pack_id: examPackId,
        job_scope: jobScope,
        baseline_run_id: baselineRunId,
        ...(options.policyName ? { policy_name: options.policyName } : {}),
        ...(options.competencyThreshold != null ? { competency_threshold: options.competencyThreshold } : {})
      })
  }),
  startRun: (runId: string) =>
    request<Scorecard>(`/runs/${pathSegment(runId)}/start`, {
      method: "POST"
    }),
  events: (runId: string, afterSequence?: number) =>
    request<RunEvent[]>(
      `/runs/${pathSegment(runId)}/events${afterSequence != null ? `?after=${encodeURIComponent(String(afterSequence))}` : ""}`
    ),
  scorecard: (runId: string) => request<Scorecard>(`/runs/${pathSegment(runId)}/scorecard`),
  trace: (runId: string) => request<TracePayload>(`/runs/${pathSegment(runId)}/trace`),
  proofBundle: (runId: string, profile: "detail" | "full" = "detail") =>
    request<ProofBundle>(
      profile === "full" ? `/runs/${pathSegment(runId)}/proof-bundle` : `/runs/${pathSegment(runId)}/detail`
    ),
  badgeUrl: (runId: string) => `${apiBaseUrl()}/runs/${pathSegment(runId)}/badge.svg`,
  cardUrl: (runId: string) => `${apiBaseUrl()}/runs/${pathSegment(runId)}/card.svg`,
  agentSpec: (runId: string) => request<AgentSpec>(`/runs/${pathSegment(runId)}/agent-spec`),
  agentSpecDiff: (runId: string) => request<AgentDiff>(`/runs/${pathSegment(runId)}/agent-spec/diff`),
  deployability: (runId: string, policy?: "strict" | "advisory") =>
    request<DeployabilityDecision>(
      `/runs/${pathSegment(runId)}/deployability${policy ? `?policy=${policy}` : ""}`
    ),
  candidateProgress: (candidateId: string) =>
    request<CandidateProgress>(`/candidates/${pathSegment(candidateId)}/progress`),
  candidateLessons: (candidateId: string, examPackId?: string) =>
    request<DiagnosticLesson[]>(
      `/candidates/${pathSegment(candidateId)}/lessons${examPackId ? `?exam_pack_id=${encodeURIComponent(examPackId)}` : ""}`
    ),
  runComparison: (runId: string, baseline?: string) =>
    request<RunComparison>(
      `/runs/${pathSegment(runId)}/comparison${baseline ? `?baseline=${encodeURIComponent(baseline)}` : ""}`
    ),
  runLessonsApplied: (runId: string) => request<DiagnosticLesson[]>(`/runs/${pathSegment(runId)}/lessons-applied`)
};
