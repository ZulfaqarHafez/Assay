import Link from "next/link";
import { CheckCircle2, AlertTriangle, Circle, Loader2, FlaskConical } from "lucide-react";
import { GaugeArt } from "@/components/ui/EmptyArt";
import { getRunSummaries } from "@/lib/serverApi";
import { VERDICT_LABEL } from "@/lib/verdict";
import type { RunSummary } from "@/types/assay";

export const dynamic = "force-dynamic";

/**
 * Experiments - the run history of the workspace. The API returns display-ready
 * run rows, so first paint is one slim read rather than run + candidate fanout.
 */
export default async function ExperimentsPage() {
  const { runs, error } = await loadRuns();

  return (
    <main className="ws-page">
      <header className="ws-head">
        <div>
          <h1>Experiments</h1>
          <p>Every run, scored and certified at pass^k. Open one to compare against its previous run and inspect the trace.</p>
        </div>
        <span className="ws-count">{runs.length} run{runs.length === 1 ? "" : "s"}</span>
      </header>

      {error ? (
        <div className="ws-empty-rich" role="alert">
          <GaugeArt size={104} className="ws-empty-art" />
          <h2>Experiments unavailable</h2>
          <p>{error}</p>
        </div>
      ) : runs.length === 0 ? (
        <div className="ws-empty-rich">
          <GaugeArt size={104} className="ws-empty-art" />
          <h2>No experiments yet</h2>
          <p>Run an agent through an adversarial suite and every scored, certified run will land here - ready to compare and inspect.</p>
          <Link href="/" className="ws-empty-cta"><FlaskConical size={15} /> Run your first test</Link>
        </div>
      ) : (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Suite</th>
                <th>Verdict</th>
                <th className="num">Score</th>
                <th className="num">k</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

async function loadRuns(): Promise<{ runs: RunSummary[]; error: string | null }> {
  try {
    return { runs: await getRunSummaries(), error: null };
  } catch (exc) {
    return { runs: [], error: exc instanceof Error ? exc.message : "Could not load experiments." };
  }
}

function RunRow({ run }: { run: RunSummary }) {
  // Scorecard summary is attached to GET /runs/summary (no per-row fetch).
  const scored = run.status === "completed" && typeof run.certified === "boolean";
  const verdict = scored ? (run.certified ? "ship" : "hold") : null;
  const passCount = run.pass_count ?? 0;
  const total = run.total_count ?? 0;
  const agentName = run.candidate_name ?? run.candidate_id;

  return (
    <tr>
      <td data-label="Agent">
        <Link prefetch={false} href={`/runs/${run.id}`} className="ws-cell-strong">{agentName}</Link>
        <div className="ws-cell-sub mono">{run.id}</div>
      </td>
      <td data-label="Suite">
        {run.qualification_status === "tailored" ? (
          <span className="ws-tag" title={run.role_brief_summary ?? "Probes tailored to this agent"}>Tailored</span>
        ) : (
          run.exam_pack_id
        )}
      </td>
      <td data-label="Verdict">
        {verdict === "ship" ? (
          <span className="ws-verdict ship"><CheckCircle2 size={13} /> {VERDICT_LABEL.ship}</span>
        ) : verdict === "hold" ? (
          <span className="ws-verdict hold"><AlertTriangle size={13} /> {VERDICT_LABEL.hold}</span>
        ) : (
          <span className="ws-verdict idle">-</span>
        )}
      </td>
      <td className="num" data-label="Score">{scored ? `${passCount}/${total}` : "-"}</td>
      <td className="num" data-label="k">{run.k}x</td>
      <td data-label="Status"><RunStatus status={run.status} /></td>
      <td className="num ws-row-action"><Link prefetch={false} href={`/runs/${run.id}`} className="ws-row-link">Open -&gt;</Link></td>
    </tr>
  );
}

function RunStatus({ status }: { status: RunSummary["status"] }) {
  if (status === "running" || status === "created")
    return <span className="ws-status running"><Loader2 size={12} className="assay-spin" /> {status}</span>;
  if (status === "failed") return <span className="ws-status failed"><AlertTriangle size={12} /> failed</span>;
  return <span className="ws-status done"><Circle size={9} /> {status}</span>;
}
