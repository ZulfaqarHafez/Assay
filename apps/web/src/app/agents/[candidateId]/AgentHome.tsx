"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertTriangle, Circle, FlaskConical } from "lucide-react";
import { useAgentHome } from "@/lib/queries";
import { AgentArt } from "@/components/ui/EmptyArt";
import ViewportDeferred from "@/components/ui/ViewportDeferred";
import type { RunSummary } from "@/types/assay";

const AgentRunControls = dynamic(() => import("@/components/assay/AgentRunControls"), {
  loading: () => <div className="agent-run-controls"><span className="ws-skeleton-row" aria-hidden="true" /></div>
});

const ProgressTrend = dynamic(() => import("@/components/progress/ProgressTrend"), {
  loading: () => <LearningSurfaceSkeleton />
});

const RunComparison = dynamic(() => import("@/components/scorecard/RunComparison"), {
  loading: () => <LearningSurfaceSkeleton />
});

/**
 * Per-agent home. The API returns the candidate, only this agent's run rows,
 * and the latest refined markdown in one scoped payload.
 */
export default function AgentHome({ candidateId }: { candidateId: string }) {
  const homeQuery = useAgentHome(candidateId);
  const candidate = homeQuery.data?.candidate ?? null;
  const runs = React.useMemo(() => homeQuery.data?.runs ?? [], [homeQuery.data]);
  const latest = runs[0] ?? null;
  const latestCompletedRun = React.useMemo(
    () => runs.find((run) => run.status === "completed") ?? null,
    [runs]
  );

  const name = candidate?.name ?? "Agent";
  const packId = latest?.source_pack_id ?? latest?.exam_pack_id ?? "hr-v1";
  const actionPackId = latestCompletedRun?.source_pack_id ?? latestCompletedRun?.exam_pack_id ?? packId;
  const refinedMarkdown = homeQuery.data?.latest_agent_markdown ?? null;

  const scored = runs.filter((run) => run.status === "completed" && typeof run.certified === "boolean");
  const latestScore = scoreOf(scored[0]);
  const prevScore = scoreOf(scored[1]);
  const delta = latestScore != null && prevScore != null ? latestScore - prevScore : null;

  return (
    <main className="ws-page">
      <header className="ws-head">
        <div>
          <Link href="/agents" className="rd-back-link"><ArrowLeft size={14} /> Agents</Link>
          <h1>{name}</h1>
          <p>
            {candidate?.adapter_type ?? "agent"} - {runs.length} run{runs.length === 1 ? "" : "s"}
            {latestScore != null && (
              <>
                {" - latest "}
                <strong>{latestScore}%</strong>
                {delta != null && delta !== 0 && (
                  <span className={delta > 0 ? "agent-delta up" : "agent-delta down"}>
                    {" "}({delta > 0 ? "+" : ""}{delta}% vs previous)
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <AgentRunControls
          candidateId={candidateId}
          agentName={name}
          examPackId={actionPackId}
          baselineRunId={latestCompletedRun?.id ?? null}
          refinedMarkdown={refinedMarkdown}
          refinedRunId={refinedMarkdown ? null : latestCompletedRun?.id ?? null}
        />
      </header>

      {homeQuery.isLoading ? (
        <div className="ws-table-wrap" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="ws-skeleton-row" key={i} />
          ))}
        </div>
      ) : homeQuery.isError ? (
        <div className="ws-empty-rich" role="alert">
          <AgentArt size={104} className="ws-empty-art" />
          <h2>Agent unavailable</h2>
          <p>{homeQuery.error.message}</p>
        </div>
      ) : runs.length === 0 ? (
        <div className="ws-empty-rich">
          <AgentArt size={104} className="ws-empty-art" />
          <h2>No runs yet for this agent</h2>
          <p>Run it through an adversarial exam and its score trajectory will build up here.</p>
          <Link href="/" className="ws-empty-cta"><FlaskConical size={15} /> Test this agent</Link>
        </div>
      ) : (
        <>
          <ViewportDeferred
            className="learning-surfaces"
            resetKey={candidateId}
            fallback={
              <>
                <LearningSurfaceSkeleton />
                <LearningSurfaceSkeleton />
              </>
            }
          >
            <ProgressTrend candidateId={candidateId} />
            {latest ? <RunComparison runId={latest.id} /> : null}
          </ViewportDeferred>

          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Verdict</th>
                  <th className="num">Score</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const verdict = run.status === "completed" && typeof run.certified === "boolean"
                    ? (run.certified ? "ship" : "hold")
                    : null;
                  const score = scoreLabel(run);
                  return (
                    <tr key={run.id}>
                      <td data-label="Run">
                        <Link prefetch={false} href={`/runs/${run.id}`} className="ws-cell-strong mono">{run.id}</Link>
                        <div className="ws-cell-sub">{run.created_at?.slice(0, 16).replace("T", " ") ?? ""}</div>
                      </td>
                      <td data-label="Verdict">
                        {verdict === "ship" ? (
                          <span className="ws-verdict ship"><CheckCircle2 size={13} /> Ship</span>
                        ) : verdict === "hold" ? (
                          <span className="ws-verdict hold"><AlertTriangle size={13} /> Needs review</span>
                        ) : (
                          <span className="ws-verdict idle">-</span>
                        )}
                      </td>
                      <td className="num" data-label="Score">{score}</td>
                      <td data-label="Status"><span className="ws-status done"><Circle size={9} /> {run.status}</span></td>
                      <td className="num ws-row-action"><Link prefetch={false} href={`/runs/${run.id}`} className="ws-row-link">Open -&gt;</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}

function LearningSurfaceSkeleton() {
  return <div className="ws-skeleton-card" aria-hidden="true" />;
}

/** Latest pass-rate as a 0-100 number, or null when not scored. */
function scoreOf(run: RunSummary | undefined): number | null {
  if (!run || typeof run.pass_count !== "number" || typeof run.total_count !== "number" || !run.total_count) {
    return null;
  }
  return Math.round((run.pass_count / run.total_count) * 100);
}

function scoreLabel(run: RunSummary): string {
  if (typeof run.pass_count === "number" && typeof run.total_count === "number") {
    return `${run.pass_count}/${run.total_count}`;
  }
  return "-";
}
