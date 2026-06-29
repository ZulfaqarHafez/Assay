import { Suspense } from "react";
import AgentHome from "./AgentHome";

/**
 * Per-agent home: `/agents/{candidateId}`. The "project you return to" surface —
 * score-over-time, run history, and one-click rerun / test-improved so iterating
 * never depends on the home-page verdict.
 */
export default async function AgentPage({ params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  return (
    <Suspense fallback={<main className="ws-page"><p className="assay-muted">Loading agent…</p></main>}>
      <AgentHome candidateId={candidateId} />
    </Suspense>
  );
}
