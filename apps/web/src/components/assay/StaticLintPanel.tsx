"use client";

import { ShieldAlert } from "lucide-react";
import type { StaticLintReport } from "@/types/assay";

export type StaticLintPanelProps = {
  report?: StaticLintReport | null;
};

const SEVERITY_LABEL: Record<StaticLintReport["findings"][number]["severity"], string> = {
  high: "High",
  medium: "Medium",
  low: "Low"
};

export function StaticLintPanel({ report }: StaticLintPanelProps) {
  if (!report || report.findings.length === 0) return null;
  const findings = report.findings.slice(0, 4);
  const extraCount = report.findings.length - findings.length;

  return (
    <section className="assay-static-lint" aria-label="Static artifact checks">
      <header className="assay-static-lint-head">
        <ShieldAlert size={16} aria-hidden />
        <h3 className="mono-label">Static artifact checks</h3>
        <span className="assay-static-lint-count data">
          {report.findings.length} finding{report.findings.length === 1 ? "" : "s"}
        </span>
      </header>
      <ol className="assay-static-lint-list">
        {findings.map((finding) => (
          <li key={finding.id} className={`is-${finding.severity}`}>
            <span className="assay-static-lint-sev">{SEVERITY_LABEL[finding.severity]}</span>
            <span>
              <strong>{finding.title}</strong>
              <small>{finding.detail}</small>
            </span>
          </li>
        ))}
      </ol>
      {extraCount > 0 ? (
        <p className="assay-static-lint-more">
          +{extraCount} more artifact check{extraCount === 1 ? "" : "s"}
        </p>
      ) : null}
    </section>
  );
}

export default StaticLintPanel;
