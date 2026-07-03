"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Sparkles, Loader2 } from "lucide-react";
import { assayApi } from "@/lib/api";
import { errorMessage } from "@/lib/derive";
import { useAgentRun } from "@/lib/useAgentRun";

/**
 * Portable "keep iterating" controls — Rerun the same agent (learning loop) or
 * Test the refined agent.md. Works from any page (RunDetail, agent home), not
 * just the home-page verdict. On completion it routes to the new run.
 */
export type AgentRunControlsProps = {
  candidateId: string | null;
  agentName: string;
  examPackId: string;
  /** Run to compare an improved-version test against. */
  baselineRunId?: string | null;
  /** The refined agent.md from the run's agent-spec, if any. */
  refinedMarkdown?: string | null;
  /** Run whose agent-spec should be fetched only if the user tests the refined agent. */
  refinedRunId?: string | null;
  className?: string;
};

export function AgentRunControls({
  candidateId,
  agentName,
  examPackId,
  baselineRunId,
  refinedMarkdown,
  refinedRunId,
  className
}: AgentRunControlsProps) {
  const router = useRouter();
  const { runStream, isRunning, error, rerun, testImproved } = useAgentRun({
    onComplete: (newRunId) => router.push(`/runs/${newRunId}`)
  });
  const [loadingSpec, setLoadingSpec] = React.useState(false);
  const [specError, setSpecError] = React.useState<string | null>(null);

  const canImprove = Boolean(refinedMarkdown?.trim() || refinedRunId);
  const total = runStream.totalExpected;
  const done = runStream.gradedCount;
  const shownError = error ?? specError;

  const testRefinedAgent = React.useCallback(async () => {
    setSpecError(null);
    let markdown = refinedMarkdown?.trim() ?? "";
    if (!markdown && refinedRunId) {
      setLoadingSpec(true);
      try {
        const spec = await assayApi.agentSpec(refinedRunId);
        markdown = spec.agent_markdown?.trim() ?? "";
      } catch (exc) {
        setSpecError(errorMessage(exc));
        return;
      } finally {
        setLoadingSpec(false);
      }
    }
    if (!markdown) {
      setSpecError("No refined agent.md is available for this run yet.");
      return;
    }
    await testImproved(markdown, `${agentName} v2`, examPackId, baselineRunId);
  }, [agentName, baselineRunId, examPackId, refinedMarkdown, refinedRunId, testImproved]);

  if (isRunning) {
    return (
      <div className={`agent-run-controls running ${className ?? ""}`} role="status">
        <Loader2 size={16} className="assay-spin" />
        <span>
          Re-testing {agentName}
          {total > 0 ? ` — ${done}/${total} probes` : "…"}
        </span>
      </div>
    );
  }

  return (
    <div className={`agent-run-controls ${className ?? ""}`}>
      <button
        type="button"
        className="command-button"
        disabled={!candidateId}
        onClick={() => candidateId && void rerun(candidateId, examPackId)}
      >
        <RotateCcw size={16} /> Rerun same agent
      </button>
      {canImprove && (
        <button
          type="button"
          className="command-button accent"
          disabled={loadingSpec}
          onClick={() => void testRefinedAgent()}
        >
          {loadingSpec ? <Loader2 size={16} className="assay-spin" /> : <Sparkles size={16} />}
          {loadingSpec ? "Preparing improved version" : "Test improved version"}
        </button>
      )}
      {shownError && <span className="agent-run-error" role="alert">{shownError}</span>}
    </div>
  );
}

export default AgentRunControls;
