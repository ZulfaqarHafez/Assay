"use client";

import { NuqsAdapter } from "nuqs/adapters/next/app";
import RunDetail from "./RunDetail";

export default function RunDetailRoute({ runId }: { runId: string }) {
  return (
    <NuqsAdapter>
      <RunDetail runId={runId} />
    </NuqsAdapter>
  );
}
