import type { UseMutationOptions, UseQueryOptions } from "@tanstack/react-query";

export type HealthPayload = {
  ok: boolean;
  tracerazor_importable: boolean;
  database_backend: string;
  openai_configured?: boolean;
};

/**
 * Centralized query-key factory. Keys must stay consistent across products so
 * invalidation works, so they live in one shared module even though the hooks
 * that use them are split per product surface (health, suites, agents, runs,
 * connectors).
 */
export const queryKeys = {
  workspaceBoot: () => ["workspace", "boot"] as const,
  health: () => ["health"] as const,
  databaseHealth: () => ["health", "database"] as const,
  examPacks: () => ["exam-packs"] as const,
  examPackSummaries: () => ["exam-packs", "summary"] as const,
  connectors: () => ["connectors"] as const,
  connectorProbes: () => ["connectors", "probe"] as const,
  candidates: () => ["candidates"] as const,
  candidateSummaries: () => ["candidates", "summary"] as const,
  runs: () => ["runs"] as const,
  runSummaries: () => ["runs", "summary"] as const,
  run: (runId: string) => ["runs", runId] as const,
  runVerdict: (runId: string) => ["runs", runId, "verdict"] as const,
  runSurfaces: (runId: string) => ["runs", runId, "surfaces"] as const,
  scorecard: (runId: string) => ["runs", runId, "scorecard"] as const,
  trace: (runId: string) => ["runs", runId, "trace"] as const,
  events: (runId: string) => ["runs", runId, "events"] as const,
  proofBundle: (runId: string) => ["runs", runId, "proof-bundle"] as const,
  agentSpec: (runId: string) => ["runs", runId, "agent-spec"] as const,
  agentSpecDiff: (runId: string) => ["runs", runId, "agent-spec", "diff"] as const,
  deployability: (runId: string) => ["runs", runId, "deployability"] as const,
  reviewers: (runId: string) => ["runs", runId, "reviewers"] as const,
  runComparison: (runId: string, baseline?: string) =>
    ["runs", runId, "comparison", baseline ?? null] as const,
  runLessonsApplied: (runId: string) => ["runs", runId, "lessons-applied"] as const,
  candidateProgress: (candidateId: string) => ["candidates", candidateId, "progress"] as const,
  candidateLessons: (candidateId: string, examPackId?: string) =>
    ["candidates", candidateId, "lessons", examPackId ?? null] as const
} as const;

/** Options forwarded to a query hook, minus the fields the hook owns. */
export type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T>, "queryKey" | "queryFn">;

/** Options forwarded to a mutation hook, minus the fields the hook owns. */
export type MutationOpts<TData, TVars> = Omit<UseMutationOptions<TData, Error, TVars>, "mutationFn">;
