"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, XCircle, KeyRound, Globe, Terminal } from "lucide-react";
import StaticLintPanel from "@/components/assay/StaticLintPanel";
import CopyButton from "@/components/ui/CopyButton";
import { HTTP_CONTRACT_URL, INSTALL_ONE_LINER } from "@/lib/surfaces";
import type { StaticLintReport } from "@/types/assay";

/**
 * The honest no-key screen. The lint ran for real; the exam did not. It shows
 * what the lint found as structure (guardrail coverage per category, dangerous
 * grants) rather than a bare list, then the three ways to get the exam to run.
 */

export type LintOnlyResultProps = {
  name: string;
  reason: string;
  report: StaticLintReport | null;
  onBack: () => void;
};

const COVERAGE_LABEL: Record<string, string> = {
  destructive: "Destructive actions",
  injection: "Prompt injection",
  secrets: "Secret handling"
};

export function LintOnlyResult({ name, reason, report, onBack }: LintOnlyResultProps) {
  const coverage = Object.entries(report?.guardrail_coverage ?? {});
  const dangerous = report?.dangerous_tools ?? [];
  const findings = report?.findings ?? [];
  const high = findings.filter((f) => f.severity === "high").length;

  return (
    <section className="assay-lint-only" aria-label="Static lint result">
      <div className="assay-demo-banner" role="status">
        <AlertTriangle size={16} />
        <span>
          <strong>Lint only - the guardrail exam did not run.</strong> {reason}
        </span>
      </div>

      <header className="lint-head">
        <h2 className="assay-lint-only-title">{name}</h2>
        <span className="lint-summary">
          {findings.length} finding{findings.length === 1 ? "" : "s"}
          {high ? `, ${high} high` : ""}
        </span>
      </header>

      {coverage.length > 0 || dangerous.length > 0 ? (
        <div className="lint-grid">
          <div className="lint-block">
            <h3 className="mono-label">Guardrail language</h3>
            <ul className="lint-coverage">
              {coverage.map(([key, covered]) => (
                <li key={key} className={covered ? "yes" : "no"}>
                  {covered ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  <span>{COVERAGE_LABEL[key] ?? key}</span>
                  <small>{covered ? "mentioned" : "not mentioned"}</small>
                </li>
              ))}
            </ul>
          </div>
          <div className="lint-block">
            <h3 className="mono-label">Dangerous grants</h3>
            {dangerous.length ? (
              <ul className="lint-tools">
                {dangerous.map((tool) => (
                  <li key={tool}><code>{tool}</code></li>
                ))}
              </ul>
            ) : (
              <p className="assay-muted">No tool that can take an irreversible action is declared.</p>
            )}
            <p className="lint-note">
              Lint reads the text. Only the exam shows whether the agent actually calls these when pushed.
            </p>
          </div>
        </div>
      ) : null}

      {findings.length > 0 ? (
        <StaticLintPanel report={report} />
      ) : (
        <p className="assay-muted">No static findings: dangerous grants, guardrail language, and secrets all check out.</p>
      )}

      <div className="lint-next">
        <h3 className="mono-label">Run the exam</h3>
        <ol className="lint-options">
          <li>
            <KeyRound size={15} />
            <span>
              <strong>Give this server a key.</strong> Set <code>OPENAI_API_KEY</code> on the Assay API and reload. A real model plays this definition; nothing changes in the file.
            </span>
          </li>
          <li>
            <Globe size={15} />
            <span>
              <strong>Exam your deployed agent instead.</strong> Put it behind one POST endpoint and register it as an{" "}
              <code>http</code> candidate. No key on the Assay side. <a href={HTTP_CONTRACT_URL} target="_blank" rel="noreferrer">The contract</a>.
            </span>
          </li>
          <li>
            <Terminal size={15} />
            <span>
              <strong>Run it from your own shell.</strong>
              <span className="lint-cmd">
                <code>{INSTALL_ONE_LINER}</code>
                <CopyButton text={INSTALL_ONE_LINER} label="Copy the CLI command" />
              </span>
            </span>
          </li>
        </ol>
      </div>

      <div className="assay-failcard-actions">
        <button type="button" className="assay-ghost-button" onClick={onBack}>
          Back to start
        </button>
      </div>
    </section>
  );
}

export default LintOnlyResult;
