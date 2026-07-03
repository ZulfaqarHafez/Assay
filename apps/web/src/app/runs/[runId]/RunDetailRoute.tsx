"use client";

import { NuqsAdapter } from "nuqs/adapters/next/app";
import RunDetail from "./RunDetail";
import type { RunVerdict } from "@/types/assay";

export default function RunDetailRoute({
  runId,
  initialVerdict = null
}: {
  runId: string;
  initialVerdict?: RunVerdict | null;
}) {
  return (
    <NuqsAdapter>
      <RunDetail runId={runId} initialVerdict={initialVerdict} />
    </NuqsAdapter>
  );
}
