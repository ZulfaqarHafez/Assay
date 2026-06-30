"use client";

/**
 * Query layer, split per product surface. The shared `queryKeys` factory and
 * option types live in `./keys`; each product's read/write hooks live in their
 * own module. This barrel re-exports them all so `@/lib/queries` imports stay
 * unchanged.
 */

export { queryKeys, type HealthPayload, type QueryOpts, type MutationOpts } from "./keys";
export { useHealth, useDatabaseHealth } from "./health";
export { useConnectors, useConnectorProbes } from "./connectors";
export { useExamPacks, useImportExamPackFile } from "./suites";
export { useCandidates, useCandidateProgress, useCandidateLessons, useCreateCandidate } from "./agents";
export {
  useRuns,
  useRun,
  useScorecard,
  useTrace,
  useEvents,
  useProofBundle,
  useAgentSpec,
  useReviewers,
  useRunComparison,
  useRunLessonsApplied,
  useCreateRun,
  useStartRun,
  type CreateRunVars
} from "./runs";
