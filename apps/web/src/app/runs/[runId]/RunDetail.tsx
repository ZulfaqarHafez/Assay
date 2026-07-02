"use client";

import Link from "next/link";
import { useQueryState, parseAsStringEnum } from "nuqs";
import {
  ArrowLeft,
  PanelRightOpen,
  Save,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  UserRoundSearch,
  Swords,
  Wrench,
  Activity,
  Rocket
} from "lucide-react";
import {
  useDeployability,
  useProofBundle,
  useReviewers,
  useRunComparison,
  useRuns,
  useScorecard,
  useTrace
} from "@/lib/queries";
import { policyRuleSentence } from "@/lib/assay";
import { VERDICT_LABEL, decisionLabel } from "@/lib/verdict";
import { downloadJson, errorMessage, labelize, maxTransferGap, traceScoreLabel } from "@/lib/derive";
import TraceDrawer from "@/components/trace/TraceDrawer";
import CompetencyRadar from "@/components/scorecard/CompetencyRadar";
import RunComparison from "@/components/scorecard/RunComparison";
import ProgressTrend from "@/components/progress/ProgressTrend";
import DiagnosticLibrary from "@/components/library/DiagnosticLibrary";
import AgentRunControls from "@/components/assay/AgentRunControls";
import ImprovePanel from "@/components/assay/ImprovePanel";
import ReviewCouncil from "@/components/assay/ReviewCouncil";
import type { DeployabilityDecision, RunEvent, Scorecard } from "@/types/assay";

/**
 * Shareable run-detail view. Reuses the same composition pieces as the console
 * (radar, comparison, trend, library, trace drawer). The trace drawer's open
 * state is mirrored into `?drawer=trace` so the URL fully describes the view.
 */
export default function RunDetail({ runId }: { runId: string }) {
  const proofBundleQuery = useProofBundle(runId);
  const traceQuery = useTrace(runId);
  const scorecardQuery = useScorecard(runId);
  const reviewersQuery = useReviewers(runId);
  // Fast, policy-honest decision (no ~8s proof-bundle wait); bundle is fallback.
  const deployabilityQuery = useDeployability(runId, { retry: false });
  const runsQuery = useRuns();

  // Drawer open/closed driven by the URL so the view is deep-linkable.
  const [drawer, setDrawer] = useQueryState(
    "drawer",
    parseAsStringEnum(["trace", "spec", "research"]).withOptions({ history: "push" })
  );
  const drawerOpen = drawer !== null;

  const proofBundle = proofBundleQuery.data ?? null;
  const trace = traceQuery.data ?? null;
  const scorecard = scorecardQuery.data ?? proofBundle?.scorecard ?? null;
  const deployability = deployabilityQuery.data ?? proofBundle?.deployability ?? null;
  const reviewers = reviewersQuery.data ?? proofBundle?.product_review ?? null;
  const events = trace?.events ?? proofBundle?.events ?? [];
  const agentSpec = proofBundle?.agent_spec ?? null;
  const candidateId = proofBundle?.candidate?.id ?? proofBundle?.run?.candidate_id ?? null;
  const candidateName = proofBundle?.candidate?.name ?? "Candidate";
  // Rerun against the originally-requested pack (a tailored run repoints exam_pack_id at a gen-* id).
  const rerunPackId = proofBundle?.run?.source_pack_id ?? proofBundle?.run?.exam_pack_id ?? "hr-v1";
  // This run tested a refined agent when it carries a baseline; conversely a
  // later run pointing back here means this run's refinery output was validated.
  const baselineRunId = proofBundle?.run?.baseline_run_id ?? null;
  const validationRun = (runsQuery.data ?? []).find((item) => item.baseline_run_id === runId) ?? null;

  // Gate the analytics on the fast scorecard, not the ~8s proof-bundle assembly.
  const isLoading = scorecardQuery.isLoading && !scorecard;
  const loadError = scorecardQuery.error ?? proofBundleQuery.error;
  const passEntries = scorecard ? Object.values(scorecard.pass_at_k ?? {}) : [];
  const passCount = passEntries.filter(Boolean).length;
  const passTotal = passEntries.length;
  const certified = scorecard?.certified ?? false;
  const deployable = deployability?.deployable ?? certified;
  const verdictLabel = deployability
    ? decisionLabel(deployability.verdict)
    : certified
      ? VERDICT_LABEL.ship
      : VERDICT_LABEL.hold;

  return (
    <main className="rd-shell">
      <header className="rd-header">
        <div className="rd-title-block">
          <Link
            href="/runs"
            className="rd-back-link"
          >
            <ArrowLeft size={14} /> Experiments
          </Link>
          <h1>{candidateName}</h1>
          <p>
            Run <code>{runId}</code>
          </p>
        </div>
        <div className="rd-actions">
          <AgentRunControls
            candidateId={candidateId}
            agentName={candidateName}
            examPackId={rerunPackId}
            baselineRunId={runId}
            refinedMarkdown={agentSpec?.agent_markdown}
          />
          <button
            type="button"
            className="command-button"
            onClick={() => void setDrawer("trace")}
          >
            <PanelRightOpen size={16} /> View trace
          </button>
          <button
            type="button"
            className="command-button"
            disabled={!proofBundle}
            onClick={() => proofBundle && downloadJson(`assay-${runId}-proof-bundle.json`, proofBundle)}
          >
            <Save size={16} /> Export proof
          </button>
        </div>
      </header>

      {scorecard ? (
        <div className={`rd-verdict ${deployable ? "ship" : "hold"}`}>
          <span className="rd-verdict-badge">
            {deployable ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            {verdictLabel}
          </span>
          <span className="rd-verdict-score">
            <strong>{passCount}/{passTotal}</strong> competencies passed
          </span>
          <span className="rd-verdict-meta">TraceRazor {traceScoreLabel(scorecard)} · transfer gap {maxTransferGap(scorecard).toFixed(2)}</span>
        </div>
      ) : null}

      {scorecard && baselineRunId ? (
        <ImprovementBanner runId={runId} baselineRunId={baselineRunId} deployable={deployable} />
      ) : null}

      {scorecard ? (
        <div className="rd-cockpit">
          <DeployabilityMeter decision={deployability} scorecard={scorecard} />
          <InterviewTimeline events={events} scorecard={scorecard} decision={deployability} />
        </div>
      ) : null}

      {reviewers ? <ReviewCouncil review={reviewers} decision={deployability} /> : null}

      {agentSpec ? (
        <ImprovePanel
          agentSpec={agentSpec}
          agentName={candidateName}
          runId={runId}
          originalMarkdown={proofBundle?.candidate?.system_prompt || undefined}
          traceAudit={scorecard?.trace_audit ?? null}
          validation={
            validationRun
              ? { state: "validated", runId: validationRun.id }
              : agentSpec.agent_markdown?.trim()
                ? { state: "pending" }
                : null
          }
        />
      ) : null}

      {isLoading ? (
        <div className="learning-surfaces">
          <div className="ws-skeleton-card" />
          <div className="ws-skeleton-card" />
        </div>
      ) : loadError ? (
        <p role="alert" className="rd-error">
          Could not load run {runId}: {errorMessage(loadError)}
        </p>
      ) : (
        <div className="learning-surfaces">
          <CompetencyRadar scorecard={scorecard} />
          <RunComparison runId={runId} baseline={scorecard?.prior_run_id ?? undefined} />
          <ProgressTrend candidateId={candidateId} />
          <DiagnosticLibrary candidateId={candidateId} />
        </div>
      )}

      <TraceDrawer
        events={events}
        trace={trace}
        scorecard={scorecard}
        proofBundle={proofBundle}
        agentSpec={agentSpec}
        agentResearch={null}
        open={drawerOpen}
        onOpenChange={(open) => void setDrawer(open ? "trace" : null)}
      />
    </main>
  );
}

function DeployabilityMeter({
  decision,
  scorecard
}: {
  decision: DeployabilityDecision | null;
  scorecard: Scorecard;
}) {
  const verdict = decision?.verdict ?? (scorecard.certified ? "ship" : "do_not_ship");
  const label = decisionLabel(verdict);
  const blocked = decision?.blocking_reasons ?? scorecard.failure_reasons ?? [];
  const warnings = decision?.warnings ?? [];
  const tone = verdict === "ship" ? "ship" : verdict === "probation" ? "probation" : "hold";
  const passValues = Object.values(scorecard.pass_at_k ?? {});
  const traceFixCount = scorecard.trace_audit?.fixes?.length ?? 0;
  const tokensSaved = scorecard.trace_audit?.savings?.tokens_saved;

  return (
    <section className={`rd-meter ${tone}`} aria-label="Deployability meter">
      <header>
        <span><ShieldCheck size={16} /> Deployability</span>
        <strong>{label}</strong>
      </header>
      <p>{decision?.summary ?? "Shared deployability policy has not been attached to this proof bundle yet."}</p>
      {decision && <p className="rd-meter-rule">Gate: {policyRuleSentence(decision.policy)}</p>}
      <div className="rd-meter-grid">
        <Metric label="pass^k" value={`${passValues.filter(Boolean).length}/${passValues.length}`} />
        <Metric label="threshold" value={`${Math.round((scorecard.thresholds.competency ?? 0.8) * 100)}%`} />
        <Metric label="TraceRazor" value={traceScoreLabel(scorecard)} />
        <Metric label="max gap" value={maxTransferGap(scorecard).toFixed(2)} />
      </div>
      {decision && (decision.passed_checks.length > 0 || decision.failed_checks.length > 0) && (
        <div className="rd-meter-checks" aria-label="Policy checks">
          {decision.failed_checks.map((check) => (
            <span className="rd-check-chip fail" key={`fail-${check}`}>{formatCheck(check)}</span>
          ))}
          {decision.passed_checks.map((check) => (
            <span className="rd-check-chip pass" key={`pass-${check}`}>{formatCheck(check)}</span>
          ))}
        </div>
      )}
      {(blocked.length > 0 || warnings.length > 0) && (
        <ul className="rd-meter-findings">
          {[...blocked.slice(0, 3), ...warnings.slice(0, Math.max(0, 3 - blocked.length))].map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      )}
      {traceFixCount > 0 && (
        <p className="rd-meter-tracefixes">
          <Activity size={13} /> {traceFixCount} TraceRazor fix{traceFixCount === 1 ? "" : "es"} available
          {typeof tokensSaved === "number" && tokensSaved > 0 ? ` (~${tokensSaved.toLocaleString()} tokens/run)` : ""} — see &ldquo;How to improve&rdquo;.
        </p>
      )}
    </section>
  );
}

/** "compliance:pass^k" → "Compliance pass^k"; bare check ids stay readable. */
function formatCheck(check: string): string {
  const [head, tail] = check.split(":");
  if (!tail) return labelize(head);
  return `${labelize(head)} ${tail.replace(/_/g, " ")}`;
}

function ImprovementBanner({
  runId,
  baselineRunId,
  deployable
}: {
  runId: string;
  baselineRunId: string;
  deployable: boolean;
}) {
  const comparisonQuery = useRunComparison(runId, baselineRunId);
  const comparison = comparisonQuery.data ?? null;
  if (!comparison) return null;

  const deltas = comparison.competencies
    .map((item) => item.delta)
    .filter((delta): delta is number => typeof delta === "number");
  const meanDelta = deltas.length
    ? Math.round((deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length) * 100)
    : 0;
  const improved = meanDelta > 0 || comparison.improved > comparison.regressed;
  const Icon = improved ? TrendingUp : TrendingDown;

  return (
    <div className={`rd-improvement ${improved ? "up" : "down"}`} role="status">
      <Icon size={16} />
      <span>
        <strong>Refined agent vs baseline&nbsp;<code>{baselineRunId}</code>:</strong>{" "}
        {comparison.improved} competenc{comparison.improved === 1 ? "y" : "ies"} improved,{" "}
        {comparison.regressed} regressed{deltas.length ? ` · mean held-out ${meanDelta >= 0 ? "+" : ""}${meanDelta} pts` : ""}
        {comparison.certified_changed ? " · certification flipped" : ""} · now {deployable ? "deployable" : "still blocked"}.
      </span>
      <Link href={`/runs/${baselineRunId}`} className="rd-improvement-link">
        View baseline
      </Link>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function InterviewTimeline({
  events,
  scorecard,
  decision
}: {
  events: RunEvent[];
  scorecard: Scorecard;
  decision: DeployabilityDecision | null;
}) {
  const toolFindings = (scorecard.failure_reasons ?? []).some((reason) => /tool|agency|mutation/i.test(reason));
  const steps = [
    {
      icon: <UserRoundSearch size={15} />,
      label: "Role research",
      state: scorecard.qualification_status === "tailored" ? "pass" : "warn",
      detail: scorecard.role_brief_summary || `${scorecard.qualification_status ?? "deterministic"} qualification`
    },
    {
      icon: <Swords size={15} />,
      label: "Adversarial rounds",
      state: scorecard.certified ? "pass" : "warn",
      detail: `${Object.keys(scorecard.pass_at_k ?? {}).length} competencies challenged`
    },
    {
      icon: <Wrench size={15} />,
      label: "Tool/state discipline",
      state: toolFindings ? "warn" : "pass",
      detail: `${events.filter((event) => event.event_type === "tool_called").length} tool call events`
    },
    {
      icon: <Activity size={15} />,
      label: "TraceRazor audit",
      state: scorecard.trace_audit.status === "ok" && scorecard.trace_audit.passes ? "pass" : "warn",
      detail: scorecard.trace_audit.status === "ok" ? `TAS ${scorecard.trace_audit.tas_score}` : scorecard.trace_audit.status
    },
    {
      icon: <Rocket size={15} />,
      label: "Release gate",
      state: decision?.deployable ? "pass" : "warn",
      detail: decisionLabel(decision?.verdict ?? (scorecard.certified ? "ship" : "do_not_ship"))
    }
  ];

  return (
    <section className="rd-timeline" aria-label="Interview timeline">
      <header>Interview timeline</header>
      <ol>
        {steps.map((step) => (
          <li className={step.state} key={step.label}>
            <span className="rd-timeline-icon">{step.icon}</span>
            <span>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
