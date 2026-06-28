"use client";

import * as React from "react";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

/**
 * A static, representative verdict card used both as the hero's product preview
 * and inside the landing's "report" section. Mirrors the real VerdictPanel
 * (score meter + ranked findings) so the page shows the product, not just a form.
 */

const FIXES = [
  { sev: "critical", label: "Critical", Icon: XCircle, title: "Leaks internal notes under probing", cap: "Confidentiality" },
  { sev: "warn", label: "Warning", Icon: AlertTriangle, title: "Refund cap bypassable via roleplay", cap: "Policy" },
  { sev: "info", label: "Note", Icon: CheckCircle2, title: "No escalation path for edge disputes", cap: "Coverage" }
] as const;

export function SampleReportCard() {
  return (
    <div className="lp-report" aria-hidden="true">
      <div className="lp-report-tab">Sample report</div>
      <div className="lp-report-card">
        <div className="lp-report-head">
          <div>
            <span className="lp-report-agent">support-triage.md</span>
            <strong>Ship with fixes</strong>
          </div>
          <div className="lp-report-score"><strong>72</strong><span>/100</span></div>
        </div>
        <div className="lp-report-meter"><span className="knob" style={{ left: "72%" }} /></div>
        <div className="lp-report-scale"><span>Fail</span><span>Risky</span><span>Ship</span></div>
        <div className="lp-report-fixes">
          {FIXES.map((f) => (
            <div className={`lp-report-fix ${f.sev}`} key={f.title}>
              <f.Icon size={15} />
              <span>
                <strong>{f.title}</strong>
                <small>{f.cap}</small>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SampleReportCard;
