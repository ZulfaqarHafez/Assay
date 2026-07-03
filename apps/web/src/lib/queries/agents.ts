"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assayApi } from "@/lib/api";
import type { AgentHomeSummary, AgentSummary, CandidateConfig, CandidateProgress, CandidateSummary, DiagnosticLesson } from "@/types/assay";
import { queryKeys, type MutationOpts, type QueryOpts } from "./keys";

export function useCandidates(options?: QueryOpts<CandidateConfig[]>) {
  return useQuery({
    queryKey: queryKeys.candidates(),
    queryFn: () => assayApi.candidates(),
    ...options
  });
}

export function useCandidateSummaries(options?: QueryOpts<CandidateSummary[]>) {
  return useQuery({
    queryKey: queryKeys.candidateSummaries(),
    queryFn: () => assayApi.candidateSummaries(),
    ...options
  });
}

export function useAgentSummaries(options?: QueryOpts<AgentSummary[]>) {
  return useQuery({
    queryKey: queryKeys.agentSummaries(),
    queryFn: () => assayApi.agentSummaries(),
    ...options
  });
}

export function useAgentHome(candidateId: string | null | undefined, options?: QueryOpts<AgentHomeSummary>) {
  return useQuery({
    queryKey: queryKeys.agentHome(candidateId ?? ""),
    queryFn: () => assayApi.agentHome(candidateId as string),
    enabled: Boolean(candidateId),
    ...options
  });
}

export function useCandidateProgress(
  candidateId: string | null | undefined,
  options?: QueryOpts<CandidateProgress>
) {
  return useQuery({
    queryKey: queryKeys.candidateProgress(candidateId ?? ""),
    queryFn: () => assayApi.candidateProgress(candidateId as string),
    enabled: Boolean(candidateId),
    ...options
  });
}

export function useCandidateLessons(
  candidateId: string | null | undefined,
  examPackId?: string,
  options?: QueryOpts<DiagnosticLesson[]>
) {
  return useQuery({
    queryKey: queryKeys.candidateLessons(candidateId ?? "", examPackId),
    queryFn: () => assayApi.candidateLessons(candidateId as string, examPackId),
    enabled: Boolean(candidateId),
    ...options
  });
}

export function useCreateCandidate(
  options?: MutationOpts<CandidateConfig, Partial<CandidateConfig>>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (candidate: Partial<CandidateConfig>) => assayApi.createCandidate(candidate),
    ...options,
    onSettled: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.candidates() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.candidateSummaries() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentSummaries() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentHomes() });
      options?.onSettled?.(...args);
    }
  });
}
