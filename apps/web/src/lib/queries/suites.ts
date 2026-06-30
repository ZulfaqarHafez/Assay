"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assayApi } from "@/lib/api";
import type { ExamPack } from "@/types/assay";
import { queryKeys, type MutationOpts, type QueryOpts } from "./keys";

export function useExamPacks(options?: QueryOpts<ExamPack[]>) {
  return useQuery({
    queryKey: queryKeys.examPacks(),
    queryFn: () => assayApi.examPacks(),
    ...options
  });
}

export function useImportExamPackFile(
  options?: MutationOpts<ExamPack, { content: string; format: "json" | "yaml" | "yml" }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ content, format }) => assayApi.importExamPackFile(content, format),
    ...options,
    onSettled: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.examPacks() });
      options?.onSettled?.(...args);
    }
  });
}
