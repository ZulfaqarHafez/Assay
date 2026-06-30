"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assayApi } from "@/lib/api";
import type { CandidateConfig, CandidateProgress, DiagnosticLesson } from "@/types/assay";
import { queryKeys, type MutationOpts, type QueryOpts } from "./keys";

export function useCandidates(options?: QueryOpts<CandidateConfig[]>) {
  return useQuery({
    queryKey: queryKeys.candidates(),
    queryFn: () => assayApi.candidates(),
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
      options?.onSettled?.(...args);
    }
  });
}
