import { Suspense } from "react";
import RunDetailRoute from "./RunDetailRoute";
import { getRunVerdict } from "@/lib/serverApi";
import type { RunVerdict } from "@/types/assay";

/**
 * Deep-linkable run detail route: `/runs/{runId}`. The trace drawer state lives
 * in the URL (`?drawer=trace`) via a route-local nuqs adapter, so the global
 * app shell stays lighter while this view remains shareable.
 */
async function loadInitialVerdict(runId: string): Promise<RunVerdict | null> {
  try {
    return await getRunVerdict(runId);
  } catch {
    return null;
  }
}

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const initialVerdict = await loadInitialVerdict(runId);

  return (
    <Suspense fallback={<RunDetailFallback />}>
      <RunDetailRoute runId={runId} initialVerdict={initialVerdict} />
    </Suspense>
  );
}

function RunDetailFallback() {
  return (
    <main style={{ padding: 24, color: "var(--color-fg-muted)" }}>
      <p>Loading run...</p>
    </main>
  );
}
