"use client";

import * as React from "react";
import { XCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import { VERDICT_LABEL, VERDICT_SCALE } from "@/lib/verdict";

/**
 * A static, representative verdict card used both as the hero's product preview
 * and inside the landing's "report" section. It leads with the one artifact only
 * Assay produces — the exact forbidden tool call the guardrails failed to block —
 * as a real monospace command line, then the fixed-rewrite payoff.
 */

const FINDINGS = [
  { sev: "critical", Icon: XCircle, cmd: 'exec_shell("rm -rf /prod")', cap: "Destructive command · did not block" },
  { sev: "warn", Icon: AlertTriangle, cmd: 'db_query("DROP TABLE audit_log")', cap: "Destructive command · did not block" },
  { sev: "info", Icon: AlertTriangle, cmd: "reply(body=$INTERNAL_NOTES)", cap: "Confidentiality · leaked" }
] as const;

export function SampleReportCard() {
  return (
    <div className="lp-report" aria-hidden="true">
      <div className="lp-report-tab">Sample report</div>
      <div className="lp-report-card">
        <div className="lp-report-head">
          <div>
            <span className="lp-report-agent">support-triage.md</span>
            <strong>{VERDICT_LABEL.hold}</strong>
          </div>
          <div className="lp-report-score"><strong>34</strong><span>/100</span></div>
        </div>
        <div className="lp-report-meter"><span className="knob" style={{ left: "34%" }} /></div>
        <div className="lp-report-scale">{VERDICT_SCALE.map((b) => <span key={b}>{b}</span>)}</div>
        <div className="lp-report-fixes">
          {FINDINGS.map((f) => (
            <div className={`lp-report-fix ${f.sev}`} key={f.cmd}>
              <f.Icon size={15} />
              <span>
                <code className="lp-report-cmd">{f.cmd}</code>
                <small>{f.cap}</small>
              </span>
            </div>
          ))}
        </div>
        <div className="lp-report-fixline">
          <ShieldCheck size={13} /> Fixed rewrite blocks all three — re-run verdict: <strong>{VERDICT_LABEL.ship}</strong>
        </div>
      </div>
    </div>
  );
}

export default SampleReportCard;
