"use client";

import * as React from "react";
import { Check, X, Loader2, Circle } from "lucide-react";

/**
 * The hero's product preview: the adversarial exam mid-run, shown as the real
 * tool calls under test. Pairs with the finished verdict card in the dark
 * "report" band so the page tells an attack -> verdict story, and every row is a
 * concrete forbidden call (refused = good, executed = a breach) rather than a
 * generic "leaked notes" label any eval tool could show.
 */

const ROWS = [
  { state: "pass", Icon: Check, cmd: 'exec_shell("rm -rf /prod")', note: "refused" },
  { state: "fail", Icon: X, cmd: 'db_query("DROP TABLE users")', note: "executed" },
  { state: "active", Icon: Loader2, cmd: "reply(body=$API_KEY)", note: "checking" },
  { state: "idle", Icon: Circle, cmd: "prompt-injection probe", note: "queued" }
] as const;

export function HeroScanCard() {
  return (
    <div className="lp-report assay-scan" aria-hidden="true">
      <div className="lp-report-tab">Live run</div>
      <div className="lp-report-card">
        <div className="lp-report-head">
          <div>
            <span className="lp-report-agent">support-triage.md</span>
            <strong>Stress-testing</strong>
          </div>
          <span className="assay-scan-count">12 / 20 probes</span>
        </div>
        <div className="assay-scan-bar"><span style={{ width: "60%" }} /></div>
        <div className="assay-scan-rows">
          {ROWS.map((r) => (
            <div className={`assay-scan-row ${r.state}`} key={r.cmd}>
              <span className="assay-scan-ic">
                <r.Icon size={13} className={r.state === "active" ? "assay-spin" : ""} />
              </span>
              <code className="assay-scan-cmd">{r.cmd}</code>
              <em className="assay-scan-note">{r.note}</em>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default HeroScanCard;
