"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useQueryState, parseAsStringEnum } from "nuqs";
import {
  BadgeCheck,
  ImageDown,
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
  useRunComparison,
  useRunSurfaces,
  useRunVerdict,
  useTrace
} from "@/lib/queries";
import { assayApi } from "@/lib/api";
import { downloadVerdictCardPng } from "@/lib/cardExport";
import { policyRuleSentence } from "@/lib/assay";
import { VERDICT_LABEL, bandFromDecision, decisionLabel } from "@/lib/verdict";
import { downloadJson, errorMessage, labelize, maxTransferGap, traceScoreLabel } from "@/lib/derive";
import AgentRunControls from "@/components/assay/AgentRunControls";
import ViewportDeferred from "@/components/ui/ViewportDeferred";
import type { DeployabilityDecision, RunComparison as RunComparisonData, RunEvent, Scorecard } from "@/types/assay";

const TraceDrawer = dynamic(() => import("@/components/trace/TraceDrawer"), {
  loading: () => null
});

const ImprovePanel = dynamic(() => import("@/components/assay/ImprovePanel"), {
  loading: () => <LearningSurfaceSkeleton />
});

const ReviewCouncil = dynamic(() => import("@/components/assay/ReviewCouncil"), {
  loading: () => <LearningSurfaceSkeleton />
});

const CompetencyRadar = dynamic(() => import("@/components/scorecard/CompetencyRadar"), {
  loading: () => <LearningSurfaceSkeleton />
});

const RunComparison = dynamic(() => import("@/components/scorecard/RunComparison"), {
  loading: () => <LearningSurfaceSkeleton />
});

const ProgressTrend = dynamic(() => import("@/components/progress/ProgressTrend"), {
  loading: () => <LearningSurfaceSkeleton />
});

const DiagnosticLibrary = dynamic(() => import("@/components/library/DiagnosticLibrary"), {
  loading: () => <LearningSurfaceSkeleton />
});

/**
 * Shareable run-detail view. Reuses the same composition pieces as the console
 * (radar, comparison, trend, library, trace drawer). The trace drawer's open
 * state is mirrored into `?drawer=trace` so the URL fully describes the view.
 */
export default function RunDetail({ runId }: { runId: string }) {
  // Drawer open/closed driven by the URL so the view is deep-linkable.
  // Only the trace inspector exists; the old spec/research values opened the
  // same view with mismatched intent, so the enum is narrowed to what renders.
  const [drawer, setDrawer] = useQueryState(
    "drawer",
    parseAsStringEnum(["trace"]).withOptions({ history: "push" })
  );
  const drawerOpen = drawer !== null;

  const verdictQuery = useRunVerdict(runId);
  const verdict = verdictQuery.data ?? null;
  const runRecord = verdict?.run ?? null;
  const candidateId = runRecord?.candidate_id ?? null;
  const [richSurfacesReady, setRichSurfacesReady] = React.useState(false);
  const criticalSettled = Boolean(verdict) || verdictQuery.isError;
  React.useEffect(() => {
    setRichSurfacesReady(false);
    if (!criticalSettled) return;
    const handle = window.setTimeout(() => setRichSurfacesReady(true), 1200);
    return () => window.clearTimeout(handle);
  }, [runId, criticalSettled]);

  const traceQuery = useTrace(runId, {
    enabled: drawerOpen
  });
  const surfacesQuery = useRunSurfaces(runId, {
    enabled: richSurfacesReady,
    retry: false
  });
  const [badgeCopied, setBadgeCopied] = React.useState(false);
  const [cardBusy, setCardBusy] = React.useState(false);
  const [exportingProof, setExportingProof] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);

  const trace = traceQuery.data ?? null;
  const scorecard = verdict?.scorecard ?? null;
  const deployability = verdict?.deployability ?? null;
  const comparisonFromVerdict = verdict?.comparison ?? undefined;
  const surfaces = surfacesQuery.data ?? null;
  const reviewers = surfaces?.product_review ?? null;
  const events = trace?.events ?? [];
  const agentSpec = surfaces?.agent_spec ?? null;
  const candidateName = verdict?.candidate?.name ?? agentSpec?.candidate_name ?? "Candidate";
  // Rerun against the originally-requested pack (a tailored run repoints exam_pack_id at a gen-* id).
  const rerunPackId = runRecord?.source_pack_id ?? runRecord?.exam_pack_id ?? agentSpec?.exam_pack_id ?? "hr-v1";
  // This run tested a refined agent when it carries a baseline; conversely a
  // later run pointing back here means this run's refinery output was validated.
  const baselineRunId = runRecord?.baseline_run_id ?? null;
  const validationRun =
    surfaces?.candidate_progress?.runs.find((item) => item.baseline_run_id === runId) ?? null;
  const comparisonFallback = React.useMemo<RunComparisonData | undefined>(() => {
    if (comparisonFromVerdict) return comparisonFromVerdict;
    if (!scorecard || scorecard.prior_run_id) return undefined;
    return {
      schema: "assay.run_comparison.v1",
      run_id: runId,
      baseline_run_id: null,
      candidate_id: runRecord?.candidate_id ?? candidateId ?? "",
      competencies: [],
      improved: 0,
      regressed: 0,
      unchanged: 0,
      certified_changed: false
    };
  }, [candidateId, comparisonFromVerdict, runRecord?.candidate_id, runId, scorecard]);

  // Gate the analytics on the slim verdict payload, not the slower proof surfaces.
  const isLoading = verdictQuery.isLoading && !scorecard;
  const loadError = verdictQuery.error;
  const passEntries = scorecard ? Object.values(scorecard.pass_at_k ?? {}) : [];
  const passCount = passEntries.filter(Boolean).length;
  const passTotal = passEntries.length;
  const certified = scorecard?.certified ?? false;
  const deployable = deployability?.deployable ?? certified;
  const verdictBand = deployability
    ? bandFromDecision(deployability.verdict)
    : certified
      ? "ship"
      : "hold";
  const verdictLabel = deployability ? decisionLabel(deployability.verdict) : VERDICT_LABEL[verdictBand];

  async function exportProofBundle() {
    setExportError(null);
    setExportingProof(true);
    try {
      const fullBundle = await assayApi.proofBundle(runId, "full");
      downloadJson(`assay-${runId}-proof-bundle.json`, fullBundle);
    } catch (exc) {
      setExportError(errorMessage(exc));
    } finally {
      setExportingProof(false);
    }
  }

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
            disabled={exportingProof}
            onClick={() => void exportProofBundle()}
          >
            <Save size={16} /> {exportingProof ? "Exporting" : "Export proof"}
          </button>
          <button
            type="button"
            className="command-button"
            title="Copy a Markdown status badge for your README or PR"
            onClick={() => {
              const url = assayApi.badgeUrl(runId);
              const md = `[![Assay verdict](${url})](${typeof window !== "undefined" ? window.location.href : ""})`;
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                void navigator.clipboard.writeText(md);
                setBadgeCopied(true);
                window.setTimeout(() => setBadgeCopied(false), 1800);
              }
            }}
          >
            <BadgeCheck size={16} /> {badgeCopied ? "Badge copied" : "Copy badge"}
          </button>
          <button
            type="button"
            className="command-button"
            title="Download a verdict card PNG for a PR or deck"
            disabled={cardBusy}
            onClick={async () => {
              setCardBusy(true);
              try {
                await downloadVerdictCardPng(assayApi.cardUrl(runId), `assay-${runId}-card.png`);
              } catch {
                /* surfaced via the disabled flag resetting */
              } finally {
                setCardBusy(false);
              }
            }}
          >
            <ImageDown size={16} /> {cardBusy ? "Rendering" : "Download card"}
          </button>
        </div>
      </header>

      {scorecard ? (
        <div className={`rd-verdict ${deployable ? "ship" : "hold"}`}>
          <span className={`stamp rd-verdict-stamp ${verdictBand}`}>
            {deployable ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {verdictLabel}
          </span>
          <span className="rd-verdict-score">
            <strong>{passCount}/{passTotal}</strong> competencies passed
          </span>
          <span className="rd-verdict-meta">TraceRazor {traceScoreLabel(scorecard)} · transfer gap {maxTransferGap(scorecard).toFixed(2)}</span>
        </div>
      ) : null}

      {scorecard && baselineRunId ? (
        <ImprovementBanner
          runId={runId}
          baselineRunId={baselineRunId}
          deployable={deployable}
          comparison={verdict?.comparison}
        />
      ) : null}

      {scorecard ? (
        <div className="rd-cockpit">
          <DeployabilityMeter decision={deployability} scorecard={scorecard} />
          <InterviewTimeline events={events} scorecard={scorecard} decision={deployability} />
        </div>
      ) : isLoading ? (
        <div className="rd-cockpit">
          <div className="ws-skeleton-card" />
          <div className="ws-skeleton-card" />
        </div>
      ) : null}

      {exportError ? (
        <p className="rd-error" role="alert">Could not export proof: {exportError}</p>
      ) : null}

      {reviewers ? (
        <ReviewCouncil review={reviewers} decision={deployability} />
      ) : richSurfacesReady && surfacesQuery.isLoading ? (
        <div className="ws-skeleton-card" />
      ) : null}

      {agentSpec ? (
        <ImprovePanel
          agentSpec={agentSpec}
          agentName={candidateName}
          runId={runId}
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

      {isLoading || !richSurfacesReady ? (
        <div className="learning-surfaces">
          <LearningSurfaceSkeleton />
          <LearningSurfaceSkeleton />
        </div>
      ) : loadError ? (
        <p role="alert" className="rd-error">
          Could not load run {runId}: {errorMessage(loadError)}
        </p>
      ) : (
        <ViewportDeferred
          className="learning-surfaces"
          resetKey={runId}
          fallback={
            <>
              <LearningSurfaceSkeleton />
              <LearningSurfaceSkeleton />
            </>
          }
        >
          <CompetencyRadar scorecard={scorecard} />
          <RunComparison
            runId={runId}
            baseline={scorecard?.prior_run_id ?? undefined}
            comparison={comparisonFallback}
          />
          <ProgressTrend
            candidateId={surfaces?.candidate_progress ? candidateId : null}
            progress={surfaces?.candidate_progress ?? undefined}
          />
          <DiagnosticLibrary
            candidateId={surfaces ? candidateId : null}
            lessons={surfaces?.diagnostic_library ?? undefined}
          />
        </ViewportDeferred>
      )}

      {drawerOpen ? (
        <TraceDrawer
          events={events}
          trace={trace}
          scorecard={scorecard}
          proofBundle={null}
          agentSpec={agentSpec}
          agentResearch={null}
          open={drawerOpen}
          onOpenChange={(open) => void setDrawer(open ? "trace" : null)}
        />
      ) : null}
    </main>
  );
}

function LearningSurfaceSkeleton() {
  return <div className="ws-skeleton-card" aria-hidden="true" />;
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
  deployable,
  comparison: providedComparison
}: {
  runId: string;
  baselineRunId: string;
  deployable: boolean;
  comparison?: RunComparisonData | null;
}) {
  const hasProvidedComparison = providedComparison !== undefined;
  const comparisonQuery = useRunComparison(hasProvidedComparison ? null : runId, baselineRunId);
  const comparison = hasProvidedComparison ? providedComparison : comparisonQuery.data ?? null;
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
