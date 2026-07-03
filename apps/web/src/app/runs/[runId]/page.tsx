import { Suspense } from "react";
import RunDetailRoute from "./RunDetailRoute";

/**
 * Deep-linkable run detail route: `/runs/{runId}`. The trace drawer state lives
 * in the URL (`?drawer=trace`) via a route-local nuqs adapter, so the global
 * app shell stays lighter while this view remains shareable.
 */
export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return (
    <Suspense fallback={<RunDetailFallback />}>
      <RunDetailRoute runId={runId} />
    </Suspense>
  );
}

function RunDetailFallback() {
  return (
    <main style={{ padding: 24, color: "var(--color-fg-muted)" }}>
      <p>Loading run…</p>
    </main>
  );
}
