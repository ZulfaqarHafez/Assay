import { Suspense } from "react";
import AgentHome from "./AgentHome";
import { getAgentHome } from "@/lib/serverApi";
import type { AgentHomeSummary } from "@/types/assay";

/**
 * Per-agent home: `/agents/{candidateId}`. The "project you return to" surface:
 * score-over-time, run history, and one-click rerun / test-improved so iterating
 * never depends on the home-page verdict.
 */
async function loadInitialHome(candidateId: string): Promise<AgentHomeSummary | null> {
  try {
    return await getAgentHome(candidateId);
  } catch {
    return null;
  }
}

export default async function AgentPage({ params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  const initialHome = await loadInitialHome(candidateId);

  return (
    <Suspense fallback={<main className="ws-page"><p className="assay-muted">Loading agent...</p></main>}>
      <AgentHome candidateId={candidateId} initialHome={initialHome} />
    </Suspense>
  );
}
