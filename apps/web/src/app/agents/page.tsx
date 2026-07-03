"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, FlaskConical } from "lucide-react";
import { useAgentSummaries } from "@/lib/queries";
import { AgentArt } from "@/components/ui/EmptyArt";

/**
 * Agents - the candidate definitions under test, deduplicated and rolled up by
 * the API so first paint is one slim read instead of candidate + run fanout.
 */
export default function AgentsPage() {
  const agentsQuery = useAgentSummaries();
  const rows = React.useMemo(() => agentsQuery.data ?? [], [agentsQuery.data]);

  return (
    <main className="ws-page">
      <header className="ws-head">
        <div>
          <h1>Agents</h1>
          <p>Every agent definition under test, with its reliability rolled up across runs.</p>
        </div>
        <span className="ws-count">{rows.length} agent{rows.length === 1 ? "" : "s"}</span>
      </header>

      {agentsQuery.isLoading ? (
        <div className="ws-table-wrap" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="ws-skeleton-row" key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="ws-empty-rich">
          <AgentArt size={104} className="ws-empty-art" />
          <h2>No agents yet</h2>
          <p>Every agent definition you test gets registered here, with its reliability rolled up across runs.</p>
          <Link href="/" className="ws-empty-cta"><FlaskConical size={15} /> Test an agent</Link>
        </div>
      ) : (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Adapter</th>
                <th className="num">Runs</th>
                <th>Latest verdict</th>
                <th className="num">Latest score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <td data-label="Agent">
                    {row.candidate_id ? (
                      <Link prefetch={false} href={`/agents/${row.candidate_id}`} className="ws-cell-strong">{row.name}</Link>
                    ) : (
                      <span className="ws-cell-strong">{row.name}</span>
                    )}
                    <div className="ws-cell-sub">{row.adapter_type}</div>
                  </td>
                  <td data-label="Adapter"><span className="ws-chip accent">{row.adapter_type}</span></td>
                  <td className="num" data-label="Runs">{row.run_count}</td>
                  <td data-label="Latest verdict">
                    {row.verdict === "ship" ? (
                      <span className="ws-verdict ship"><CheckCircle2 size={13} /> Ship</span>
                    ) : row.verdict === "hold" ? (
                      <span className="ws-verdict hold"><AlertTriangle size={13} /> Needs review</span>
                    ) : (
                      <span className="ws-verdict idle">-</span>
                    )}
                  </td>
                  <td className="num" data-label="Latest score">{row.score ?? "-"}</td>
                  <td className="num ws-row-action">
                    {row.candidate_id ? <Link prefetch={false} href={`/agents/${row.candidate_id}`} className="ws-row-link">Open -&gt;</Link> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
