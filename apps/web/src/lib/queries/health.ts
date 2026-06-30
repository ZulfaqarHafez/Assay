"use client";

import { useQuery } from "@tanstack/react-query";
import { assayApi } from "@/lib/api";
import type { DatabaseHealth } from "@/types/assay";
import { queryKeys, type HealthPayload, type QueryOpts } from "./keys";

export function useHealth(options?: QueryOpts<HealthPayload>) {
  return useQuery({
    queryKey: queryKeys.health(),
    queryFn: () => assayApi.health(),
    ...options
  });
}

export function useDatabaseHealth(options?: QueryOpts<DatabaseHealth>) {
  return useQuery({
    queryKey: queryKeys.databaseHealth(),
    queryFn: () => assayApi.databaseHealth(),
    ...options
  });
}
