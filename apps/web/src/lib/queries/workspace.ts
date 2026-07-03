"use client";

import { useQuery } from "@tanstack/react-query";
import { assayApi } from "@/lib/api";
import type { WorkspaceBoot } from "@/types/assay";
import { queryKeys, type QueryOpts } from "./keys";

export function useWorkspaceBoot(options?: QueryOpts<WorkspaceBoot>) {
  return useQuery({
    queryKey: queryKeys.workspaceBoot(),
    queryFn: () => assayApi.workspaceBoot(),
    ...options
  });
}
