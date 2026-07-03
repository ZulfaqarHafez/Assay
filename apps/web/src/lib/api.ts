import type { AgentDiff, AgentIntakeResponse, AgentResearch, AgentSpec, AgentSpecFileExport, CandidateConfig, CandidateProgress, CandidateSummary, Connector, ConnectorProbe, DatabaseHealth, DeployabilityDecision, DiagnosticLesson, ExamPack, ExamPackExport, ExamPackFileExport, Health, JobScope, ProductReview, ProofBundle, RoleAnalysis, RoleBrief, RunComparison, RunEvent, RunRecord, RunSummary, Scorecard, TracePayload } from "@/types/assay";

function apiBaseUrl() {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  if (typeof window !== "undefined") {
    const port = Number(window.location.port);
    const isLocal = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
    if (isLocal && Number.isFinite(port) && port >= 3000 && port < 4000) {
      return `${window.location.protocol}//${window.location.hostname}:${port + 5000}`;
    }
  }
  return "http://127.0.0.1:8000";
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
  health: () => request<Health>("/health"),
  databaseHealth: () => request<DatabaseHealth>("/health/database"),
  examPacks: () => request<ExamPack[]>("/exam-packs"),
  importExamPackFile: (content: string, format: "json" | "yaml" | "yml") =>
    request<ExamPack>("/exam-packs/import-file", {
      method: "POST",
      body: JSON.stringify({ content, format })
    }),
  examPackExport: (packId: string) => request<ExamPackExport>(`/exam-packs/${packId}/export`),
  examPackFileExport: (packId: string) =>
    request<ExamPackFileExport>(`/exam-packs/${packId}/export-files`, {
      method: "POST"
    }),
  connectors: () => request<Connector[]>("/connectors"),
  connectorProbes: () => request<ConnectorProbe[]>("/connectors/probe"),
  candidates: () => request<CandidateConfig[]>("/candidates"),
  candidateSummaries: () => request<CandidateSummary[]>("/candidates/summary"),
  runs: () => request<RunRecord[]>("/runs"),
  runSummaries: () => request<RunSummary[]>("/runs/summary"),
  run: (runId: string) => request<RunRecord>(`/runs/${runId}`),
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
    request<Scorecard>(`/runs/${runId}/start`, {
      method: "POST"
    }),
  events: (runId: string) => request<RunEvent[]>(`/runs/${runId}/events`),
  scorecard: (runId: string) => request<Scorecard>(`/runs/${runId}/scorecard`),
  reviewers: (runId: string) => request<ProductReview>(`/runs/${runId}/reviewers`),
  trace: (runId: string) => request<TracePayload>(`/runs/${runId}/trace`),
  proofBundle: (runId: string, profile: "detail" | "full" = "detail") =>
    request<ProofBundle>(
      profile === "full" ? `/runs/${runId}/proof-bundle` : `/runs/${runId}/detail`
    ),
  badgeUrl: (runId: string) => `${apiBaseUrl()}/runs/${runId}/badge.svg`,
  cardUrl: (runId: string) => `${apiBaseUrl()}/runs/${runId}/card.svg`,
  agentSpec: (runId: string) => request<AgentSpec>(`/runs/${runId}/agent-spec`),
  agentSpecDiff: (runId: string) => request<AgentDiff>(`/runs/${runId}/agent-spec/diff`),
  deployability: (runId: string, policy?: "strict" | "advisory") =>
    request<DeployabilityDecision>(
      `/runs/${runId}/deployability${policy ? `?policy=${policy}` : ""}`
    ),
  agentSpecFileExport: (runId: string) =>
    request<AgentSpecFileExport>(`/runs/${runId}/agent-spec/export-files`, {
      method: "POST"
    }),
  agentResearch: (runId: string, mode: "fast" | "deep") =>
    request<AgentResearch>(`/runs/${runId}/agent-spec/research?mode=${mode}`, {
      method: "POST"
    }),
  roleAnalysis: (rawText: string, extract: "keyword" | "openai-fast" | "openai-deep" = "keyword", overridePackId: string | null = null) =>
    request<RoleAnalysis>("/role-analysis", {
      method: "POST",
      body: JSON.stringify({ raw_text: rawText, extract, override_pack_id: overridePackId })
    }),
  runRoleAnalysis: (runId: string) => request<RoleAnalysis>(`/runs/${runId}/role-analysis`),
  roleBrief: (runId: string) => request<RoleBrief>(`/runs/${runId}/role-brief`),
  candidateProgress: (candidateId: string) =>
    request<CandidateProgress>(`/candidates/${candidateId}/progress`),
  candidateLessons: (candidateId: string, examPackId?: string) =>
    request<DiagnosticLesson[]>(
      `/candidates/${candidateId}/lessons${examPackId ? `?exam_pack_id=${encodeURIComponent(examPackId)}` : ""}`
    ),
  runComparison: (runId: string, baseline?: string) =>
    request<RunComparison>(
      `/runs/${runId}/comparison${baseline ? `?baseline=${encodeURIComponent(baseline)}` : ""}`
    ),
  runLessonsApplied: (runId: string) => request<DiagnosticLesson[]>(`/runs/${runId}/lessons-applied`)
};
