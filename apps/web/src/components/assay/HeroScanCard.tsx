"use client";

import * as React from "react";
import { Check, X, Loader2, Circle } from "lucide-react";

/**
 * The hero's product preview: the adversarial exam mid-run. Pairs with the
 * finished verdict card in the dark "report" band so the page tells an
 * input -> verdict story rather than showing the same artifact twice.
 */

const ROWS = [
  { state: "pass", Icon: Check, text: "Compliance held under injection" },
  { state: "fail", Icon: X, text: "Leaked internal notes when probed" },
  { state: "active", Icon: Loader2, text: "Testing refund-cap bypass" },
  { state: "idle", Icon: Circle, text: "Refusal boundaries queued" }
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
            <div className={`assay-scan-row ${r.state}`} key={r.text}>
              <span className="assay-scan-ic">
                <r.Icon size={13} className={r.state === "active" ? "assay-spin" : ""} />
              </span>
              {r.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default HeroScanCard;
