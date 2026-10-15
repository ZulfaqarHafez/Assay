"use client";

import * as React from "react";
import { CheckCircle2, XCircle, ShieldMinus, Activity } from "lucide-react";
import {
  competencyRows,
  exercisedByLabel,
  generatedOn,
  showcaseLabel,
  tripwireLabel,
  uniqueBreaches,
  type ShowcaseRun
} from "@/lib/showcase";

/**
 * A real exam result rendered as a card. Every number comes from the bundled
 * showcase JSON that scripts/export_showcase.py wrote from a genuine run, so
 * the hero and the report band show Assay's actual output. "compact" is the
 * hero preview (verdict, scores, top breaches); "full" adds the privilege
 * delta, the trace audit and the provenance line.
 */

export type ShowcaseRunCardProps = {
  run: ShowcaseRun;
  variant?: "compact" | "full";
  /** Shown above the card as a tab, e.g. "Real run". */
  tab?: string;
};

export function ShowcaseRunCard({ run, variant = "full", tab }: ShowcaseRunCardProps) {
  const label = showcaseLabel(run);
  const tone = run.verdict === "ship" ? "ship" : run.verdict === "probation" ? "risky" : "hold";
  const rows = competencyRows(run);
  const breaches = uniqueBreaches(run);
  const shown = variant === "compact" ? breaches.slice(0, 3) : breaches;
  const hidden = breaches.length - shown.length;
  const removable = run.privilege_delta?.removable ?? [];
  const tas = run.trace_audit?.tas_score;

  return (
    <div className={`lp-report sc-card ${variant}`} data-verdict={tone}>
      {tab ? <div className="lp-report-tab">{tab}</div> : null}
      <div className="lp-report-card sc-body">
        <div className="sc-head">
          <div className="sc-title">
            <span className="lp-report-agent">{run.candidate.name}</span>
            <strong>{label}</strong>
          </div>
          <span className={`stamp sc-stamp ${tone}`}>
            {run.deployable ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {label}
          </span>
        </div>

        <ul className="sc-scores" aria-label="Held-out score per competency">
          {rows.map((row) => (
            <li key={row.id} className={row.passed ? "pass" : "fail"}>
              <span className="sc-score-label">{row.label}</span>
              <span className="sc-score-bar" aria-hidden="true">
                <i style={{ width: `${Math.round(row.score * 100)}%` }} />
              </span>
              <span className="sc-score-val">{Math.round(row.score * 100)}%</span>
            </li>
          ))}
        </ul>

        {shown.length > 0 ? (
          <ol className="sc-breaches" aria-label="Tripwires hit">
            {shown.map((b) => (
              <li key={`${b.tripwire}-${b.tool_call}`}>
                <span className="sc-breach-cap">
                  {tripwireLabel(b.tripwire)}
                  {b.hits > 1 ? ` x${b.hits}` : ""}
                </span>
                <code className="lp-report-cmd">{b.tool_call}</code>
              </li>
            ))}
          </ol>
        ) : (
          <p className="sc-clean">
            <CheckCircle2 size={14} /> 0 tripwires hit across {run.probes} probes
          </p>
        )}
        {hidden > 0 ? <p className="sc-more">+{hidden} more tripwire{hidden === 1 ? "" : "s"} in the run</p> : null}

        {variant === "full" ? (
          <dl className="sc-facts">
            <div>
              <dt><ShieldMinus size={13} /> Privilege delta</dt>
              <dd>
                {removable.length
                  ? `${removable.length} of ${run.privilege_delta.declared.length} granted tools never used: ${removable.join(", ")}`
                  : `all ${run.privilege_delta.declared.length} granted tools were used`}
              </dd>
            </div>
            <div>
              <dt><Activity size={13} /> TraceRazor</dt>
              <dd>
                {run.trace_audit.status === "ok" && typeof tas === "number"
                  ? `TAS ${tas.toFixed(1)}, ${run.trace_audit.fixes} fix${run.trace_audit.fixes === 1 ? "" : "es"} proposed`
                  : run.trace_audit.status}
              </dd>
            </div>
          </dl>
        ) : null}

        <p className="sc-provenance">
          {run.probes} probes, {run.exam_pack_id}, k={run.k}. Answered by {exercisedByLabel(run)} on {generatedOn(run)}.
          {" "}
          <code>{run.run_id}</code>
        </p>
      </div>
    </div>
  );
}

export default ShowcaseRunCard;
