"use client";

import { useQuery } from "@tanstack/react-query";
import { assayApi } from "@/lib/api";
import type { Connector, ConnectorProbe } from "@/types/assay";
import { queryKeys, type QueryOpts } from "./keys";

export function useConnectors(options?: QueryOpts<Connector[]>) {
  return useQuery({
    queryKey: queryKeys.connectors(),
    queryFn: () => assayApi.connectors(),
    ...options
  });
}

export function useConnectorProbes(options?: QueryOpts<ConnectorProbe[]>) {
  return useQuery({
    queryKey: queryKeys.connectorProbes(),
    queryFn: () => assayApi.connectorProbes(),
    ...options
  });
}
