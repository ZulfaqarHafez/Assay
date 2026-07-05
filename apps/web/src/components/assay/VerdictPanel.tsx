"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight, RotateCcw, PanelRightOpen, LayoutDashboard, Sparkles } from "lucide-react";
import { deriveVerdict, deriveFixes, deriveCategoryScores, policyRuleSentence, type FixSeverity } from "@/lib/assay";
import ImprovePanel from "@/components/assay/ImprovePanel";
import PrivilegeDeltaPanel from "@/components/assay/PrivilegeDeltaPanel";
import StaticLintPanel from "@/components/assay/StaticLintPanel";
import RunComparison from "@/components/scorecard/RunComparison";
import { VERDICT_LABEL, VERDICT_SCALE } from "@/lib/verdict";
import type { Scorecard, AgentSpec, DeployabilityDecision, StaticLintReport } from "@/types/assay";

/**
 * The payoff screen. One verdict, one score, one biggest-problem sentence
 * (the 2-second glance), then the ranked "what to fix" list the developer came
 * for, then a category band that drills into evidence. Replaces the old wall of
 * nine always-open panels with a single progressive column.
 */

export type VerdictPanelProps = {
  scorecard: Scorecard;
  agentSpec: AgentSpec | null;
  agentName: string;
  deployability?: DeployabilityDecision | null;
  staticLint?: StaticLintReport | null;
  originalMarkdown?: string;
  onViewTrace: () => void;
  onTestAnother: () => void;
  onRerun: () => void;
  onTestImproved: () => void;
};

const VERDICT_ICON = {
  ship: CheckCircle2,
  risky: AlertTriangle,
  hold: XCircle
} as const;

const SEVERITY_LABEL: Record<FixSeverity, string> = {
  critical: "Critical",
  warn: "Warning",
  info: "Note"
};

export function VerdictPanel({
  scorecard,
  agentSpec,
  agentName,
  deployability = null,
  staticLint = null,
  originalMarkdown,
  onViewTrace,
  onTestAnother,
  onRerun,
  onTestImproved
}: VerdictPanelProps) {
  const verdict = React.useMemo(() => deriveVerdict(scorecard, deployability), [scorecard, deployability]);
  const fixes = React.useMemo(() => deriveFixes(scorecard, agentSpec), [scorecard, agentSpec]);
  const categories = React.useMemo(() => deriveCategoryScores(scorecard), [scorecard]);
  const [improveOpen, setImproveOpen] = React.useState(false);
  const Icon = VERDICT_ICON[verdict.verdict];
  const canTestImproved = Boolean(agentSpec?.agent_markdown?.trim());
  // One primary CTA driven by verdict state: ship → workspace; fail/risky →
  // fix-and-retry when a refined md exists, else rerun.
  const primaryAction: "workspace" | "improve" | "rerun" =
    verdict.verdict === "ship" ? "workspace" : canTestImproved ? "improve" : "rerun";

  return (
    <section className="assay-verdict" aria-label="Verdict">
      {scorecard.degraded && (
        <div className="assay-demo-banner" role="status">
          <AlertTriangle size={16} />
          <span>
            <strong>Demo result.</strong> Your OpenAI key hit its rate limit (free tier is ~3 requests/min), so
            Assay graded with deterministic stand-in answers. Add billing to your OpenAI account for a live
            evaluation of your real agent.
          </span>
        </div>
      )}
      <div className={`assay-verdict-hero ${verdict.verdict}`}>
        <div className="assay-verdict-mark" aria-hidden="true">
          <Icon size={34} />
        </div>
        <div className="assay-verdict-copy">
          <span className="assay-verdict-eyebrow">{agentName}</span>
          <span className={`stamp assay-verdict-stamp ${verdict.verdict}`}>
            {VERDICT_LABEL[verdict.verdict]}
          </span>
          <h2>{verdict.label}</h2>
          <p>{verdict.headline}</p>
        </div>
        <div className="assay-verdict-score" aria-label={`Capability score ${verdict.score} out of 100`}>
          <strong className="litmus-num">{verdict.score}</strong>
          <span>/ 100</span>
          <small>{verdict.passedChecks}/{verdict.totalChecks} checks held</small>
        </div>
      </div>

      {scorecard.trials_stochastic === false && (
        <p className="assay-trials-note" role="note">
          Deterministic run - the {scorecard.k} trials per probe are identical, so this is a single
          held-out check, not a pass^{scorecard.k} resampling measure. Run live (with an OpenAI key)
          to certify reliability across varied trials.
        </p>
      )}

      <div className="assay-verdict-meter">
        <div
          className="assay-litmus-meter"
          role="img"
          aria-label={`Litmus score ${verdict.score} of 100 on the fail-to-ship scale`}
        >
          <span className="knob" style={{ left: `${Math.min(98, Math.max(2, verdict.score))}%` }} />
          {deployability && (
            <span
              className="threshold-tick"
              style={{ left: `${Math.round(deployability.policy.competency_threshold * 100)}%` }}
              title={`Policy bar: every competency ≥${Math.round(deployability.policy.competency_threshold * 100)}% held-out`}
            />
          )}
        </div>
        <div className="scale" aria-hidden="true">
          {VERDICT_SCALE.map((band) => (
            <span key={band}>{band}</span>
          ))}
        </div>
        {deployability && (
          <p className="assay-policy-rule">
            Judged against: {policyRuleSentence(deployability.policy)}
          </p>
        )}
      </div>

      <div className="assay-verdict-actions">
        {/* Exactly one visually-primary CTA, chosen by verdict: SHIP → open the
            workspace; otherwise fix-and-retry (or rerun when no refined md yet). */}
        <button
          type="button"
          className={primaryAction === "rerun" ? "assay-run-button" : "assay-ghost-button"}
          onClick={onRerun}
        >
          <RotateCcw size={16} /> Rerun same agent
        </button>
        {canTestImproved && (
          <button
            type="button"
            className={primaryAction === "improve" ? "assay-run-button ghost-accent" : "assay-ghost-button"}
            onClick={onTestImproved}
          >
            <Sparkles size={16} /> Test improved version
          </button>
        )}
        <Link
          href={`/runs/${scorecard.run_id}`}
          className={primaryAction === "workspace" ? "assay-run-button" : "assay-ghost-button"}
        >
          <LayoutDashboard size={16} /> Open in workspace
        </Link>
        <button type="button" className="assay-ghost-button" onClick={onViewTrace}>
          <PanelRightOpen size={16} /> Open full trace
        </button>
        <button type="button" className="assay-text-button" onClick={onTestAnother}>
          Test a different agent
        </button>
      </div>

      <div className="assay-fixes">
        <h3 className="assay-section-label"><span className="section-no">01</span>What to fix</h3>
        <ol className="assay-fix-list">
          {fixes.map((fix) => (
            <li key={fix.id} className={`assay-fix ${fix.severity}`}>
              <span className="assay-fix-sev">{SEVERITY_LABEL[fix.severity]}</span>
              <span className="assay-fix-body">
                <strong>{fix.title}</strong>
                <small>{fix.detail}</small>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <StaticLintPanel report={staticLint} />

      <PrivilegeDeltaPanel delta={scorecard.privilege_delta} />

      <div className="assay-categories">
        <h3 className="assay-section-label"><span className="section-no">02</span>By capability</h3>
        {scorecard.degraded && (
          <p className="assay-muted assay-demo-note">
            Demo scores - graded from deterministic stand-in answers shaped by your agent.md, not a
            live model run. Add OpenAI billing for a live evaluation.
          </p>
        )}
        <div className="assay-category-grid">
          {categories.map((category) => (
            <div key={category.competency} className={`assay-category ${category.passed ? "pass" : "fail"}`}>
              <span className="assay-category-name">{category.label}</span>
              <span className="assay-category-score">{category.score}%</span>
              <span className="assay-category-bar" aria-hidden="true">
                <span style={{ width: `${category.score}%` }} />
              </span>
            </div>
          ))}
          {categories.length === 0 && <p className="assay-muted">No competency breakdown for this run.</p>}
        </div>
      </div>

      {/* The coaching depth lives one disclosure down so the 5-second path is
          verdict → score → biggest problem → top fixes, not a wall of panels. */}
      <details
        className="assay-improve-more"
        onToggle={(event) => setImproveOpen(event.currentTarget.open)}
      >
        <summary>
          <span className="section-no">03</span>
          <Sparkles size={15} /> How to improve - refined agent.md, coaching, and run comparison
        </summary>
        {improveOpen ? (
          <div className="assay-improve-more-body">
            {scorecard.prior_run_id && (
              <RunComparison runId={scorecard.run_id} className="assay-verdict-comparison" />
            )}
            <ImprovePanel
              agentSpec={agentSpec}
              agentName={agentName}
              runId={scorecard.run_id}
              originalMarkdown={originalMarkdown}
              traceAudit={scorecard.trace_audit}
              validation={agentSpec?.agent_markdown?.trim() ? { state: "pending" } : null}
            />
          </div>
        ) : null}
      </details>

      <button type="button" className="assay-evidence-link" onClick={onViewTrace}>
        See the adversarial prompts and the judge&rsquo;s reasoning <ArrowRight size={14} />
      </button>
    </section>
  );
}

export default VerdictPanel;
