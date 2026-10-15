"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { assayApi } from "@/lib/api";
import {
  useWorkspaceBoot,
  queryKeys
} from "@/lib/queries";
import { useRunStream } from "@/lib/useRunStream";
import { errorMessage, type LoadState } from "@/lib/derive";
import AgentIntake, { type IntakePolicy } from "@/components/assay/AgentIntake";
import LintOnlyResult from "@/components/assay/LintOnlyResult";
import { AGENT_TEMPLATES } from "@/lib/assayTemplates";
import type {
  AgentSpec,
  CandidateSummary,
  DeployabilityDecision,
  RunEvent,
  RunRecord,
  Scorecard,
  StaticLintReport,
  TracePayload,
  WorkspaceBoot
} from "@/types/assay";

const JudgingWaterfall = dynamic(() => import("@/components/assay/JudgingWaterfall"), {
  loading: () => (
    <section className="assay-judging" aria-label="Live judging loading">
      <div className="assay-progress" aria-hidden="true">
        <div className="assay-progress-fill" style={{ width: "8%" }} />
      </div>
      <p className="assay-muted">Preparing the live examiner...</p>
    </section>
  )
});

const VerdictPanel = dynamic(() => import("@/components/assay/VerdictPanel"), {
  loading: () => (
    <section className="assay-verdict" aria-label="Verdict loading">
      <p className="assay-muted">Assembling the verdict...</p>
    </section>
  )
});

const TraceDrawer = dynamic(() => import("@/components/trace/TraceDrawer"), {
  loading: () => null
});

const Landing = dynamic(() => import("@/components/assay/Landing"), {
  ssr: false,
  loading: () => null
});

function markQueryStale(queryClient: QueryClient, queryKey: QueryKey) {
  void queryClient.invalidateQueries({ queryKey, refetchType: "none" });
}

function markCandidateListsStale(queryClient: QueryClient) {
  markQueryStale(queryClient, queryKeys.workspaceBoot());
  markQueryStale(queryClient, queryKeys.candidateSummaries());
}

function markRunListsStale(queryClient: QueryClient) {
  markQueryStale(queryClient, queryKeys.workspaceBoot());
  markQueryStale(queryClient, queryKeys.runs());
  markQueryStale(queryClient, queryKeys.runSummaries());
}

export type HomeClientProps = {
  initialBoot?: WorkspaceBoot | null;
};

export function HomeClient({ initialBoot = null }: HomeClientProps) {
  const queryClient = useQueryClient();
  // One boot snapshot keeps first paint to a single cached API read.
  const bootQuery = useWorkspaceBoot(
    initialBoot
      ? {
          initialData: initialBoot,
          staleTime: 30_000
        }
      : undefined
  );

  const health = bootQuery.data?.health ?? null;
  const examPacks = useMemo(() => bootQuery.data?.exam_pack_summaries ?? [], [bootQuery.data]);
  const candidates = useMemo(
    () => bootQuery.data?.candidate_summaries ?? [],
    [bootQuery.data]
  );

  const bootLoading = bootQuery.isLoading;

  // The API is unreachable at boot when the core queries error out - surface
  // that on the intake screen so the user isn't ambushed only after clicking Run.
  const apiUnreachable = bootQuery.isError;

  // Run-scoped state set imperatively once a run resolves.
  // The guardrail exam is the product; other packs stay available via the API.
  const [selectedExamPackId, setSelectedExamPackId] = useState("guardrail-v1");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [extraCandidates, setExtraCandidates] = useState<CandidateSummary[]>([]);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [trace, setTrace] = useState<TracePayload | null>(null);
  const [agentSpec, setAgentSpec] = useState<AgentSpec | null>(null);
  const [deployability, setDeployability] = useState<DeployabilityDecision | null>(null);
  const [staticLint, setStaticLint] = useState<StaticLintReport | null>(null);
  // Set when the server has no model key: the definition was linted, the exam did not run.
  const [lintOnly, setLintOnly] = useState<{ name: string; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [intakeSubmitting, setIntakeSubmitting] = useState(false);
  // The definition as submitted this session, so the verdict's diff has a true "before".
  const [submittedMarkdown, setSubmittedMarkdown] = useState("");
  const [runPolicy, setRunPolicy] = useState<IntakePolicy | null>(null);

  const runStream = useRunStream();

  // Merge server candidates with any registered locally this session.
  const allCandidates = useMemo(() => {
    const seen = new Set<string>();
    const merged: CandidateSummary[] = [];
    for (const item of [...extraCandidates, ...candidates]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
    return merged;
  }, [extraCandidates, candidates]);

  const candidate = useMemo(() => {
    if (selectedCandidateId) {
      const match = allCandidates.find((item) => item.id === selectedCandidateId);
      if (match) return match;
    }
    return null;
  }, [selectedCandidateId, allCandidates]);

  // Map run-stream lifecycle onto the LoadState used to drive the phase.
  const state: LoadState = useMemo(() => {
    if (runStream.status === "queued" || runStream.status === "running") return "running";
    if (error || runStream.status === "failed") return "error";
    if (scorecard) return "complete";
    if (bootLoading) return "loading";
    return "idle";
  }, [runStream.status, error, scorecard, bootLoading]);

  const isRunning = state === "running";

  const selectedExamPack = examPacks.find((pack) => pack.id === selectedExamPackId) ?? examPacks[0];

  // When the stream completes, capture the scorecard and load the run artifacts.
  useEffect(() => {
    if (runStream.status !== "completed" || !runStream.scorecard) return;
    const completedScorecard = runStream.scorecard;
    setScorecard(completedScorecard);
    void hydrateRunArtifacts(completedScorecard.run_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runStream.status, runStream.scorecard]);

  // Surface stream failures in the existing error channel.
  useEffect(() => {
    if (runStream.status === "failed" && runStream.error) {
      setError(runStream.error);
    }
  }, [runStream.status, runStream.error]);

  // Keep the live events in sync with the stream while running.
  useEffect(() => {
    if (isRunning && runStream.events.length) {
      setEvents(runStream.events);
    }
  }, [isRunning, runStream.events]);

  // Default the selected pack to a valid one once packs load.
  useEffect(() => {
    if (examPacks.length && !examPacks.some((pack) => pack.id === selectedExamPackId)) {
      setSelectedExamPackId(examPacks[0].id);
    }
  }, [examPacks, selectedExamPackId]);

  function resetRunArtifacts() {
    setEvents([]);
    setScorecard(null);
    setTrace(null);
    setAgentSpec(null);
    setDeployability(null);
    setStaticLint(null);
    setLintOnly(null);
  }

  async function hydrateRunArtifacts(runId: string) {
    try {
      const payoff = await assayApi.runPayoff(runId);
      setEvents([]);
      setTrace(null);
      setAgentSpec(payoff.agent_spec ?? null);
      setDeployability(payoff.deployability ?? null);
      markRunListsStale(queryClient);
    } catch (exc) {
      setError(errorMessage(exc));
    }
  }

  // Assay primary flow: take an uploaded/authored agent.md, register it as the
  // candidate under test, then run the adversarial exam (a real model plays the
  // agent) and stream the judging. With no model key on the server the intake
  // still lints the file, and the screen says the exam needs a key.
  async function runAgentMarkdown(markdown: string, roleScopeText?: string, policy?: IntakePolicy, filename?: string) {
    if (!markdown.trim()) return;
    setError(null);
    resetRunArtifacts();
    runStream.reset();
    setRun(null);
    setIntakeSubmitting(true);
    setSubmittedMarkdown(markdown);
    setRunPolicy(policy ?? null);
    try {
      const intake = await assayApi.candidateFromMarkdown(markdown, null, filename ?? null);
      const created = intake.candidate;
      setStaticLint(intake.static_lint ?? null);
      setExtraCandidates((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSelectedCandidateId(created.id);
      markCandidateListsStale(queryClient);
      if (intake.exam_available === false) {
        setLintOnly({ name: created.name, reason: intake.exam_unavailable_reason ?? "The guardrail exam needs a model key on the Assay server." });
        return;
      }
      const packId = selectedExamPack?.id ?? selectedExamPackId ?? "guardrail-v1";
      const jobScope = roleScopeText?.trim()
        ? {
            raw_text: roleScopeText.trim(),
            title: "",
            seniority: "unspecified" as const,
            responsibilities: [],
            required_skills: [],
            nice_to_have: [],
            qualifications: [],
            domain: "",
            risks: [],
            compliance_flags: [],
            extraction: "none" as const
          }
        : null;
      const createdRun = await assayApi.createRun(created.id, packId, jobScope, null, {
        policyName: policy?.name,
        competencyThreshold: policy?.competencyThreshold
      });
      markRunListsStale(queryClient);
      const runPack = examPacks.find((pack) => pack.id === createdRun.exam_pack_id) ?? selectedExamPack;
      setRun(createdRun);
      runStream.start(createdRun.id, { k: createdRun.k, itemCount: runPack?.item_count });
    } catch (exc) {
      setError(errorMessage(exc));
    } finally {
      setIntakeSubmitting(false);
    }
  }

  function cancelRun() {
    runStream.cancel();
  }

  // Return to the calm intake screen to test another agent.
  function testAnother() {
    setError(null);
    resetRunArtifacts();
    runStream.reset();
    setRun(null);
  }

  // Kick off a fresh run for an already-registered candidate (no intake step).
  async function startRunForCandidate(candidateId: string) {
    setError(null);
    resetRunArtifacts();
    runStream.reset();
    setRun(null);
    try {
      const packId = selectedExamPack?.id ?? selectedExamPackId ?? "guardrail-v1";
      const createdRun = await assayApi.createRun(candidateId, packId, null, null, {
        policyName: runPolicy?.name,
        competencyThreshold: runPolicy?.competencyThreshold
      });
      markRunListsStale(queryClient);
      const runPack = examPacks.find((pack) => pack.id === createdRun.exam_pack_id) ?? selectedExamPack;
      setRun(createdRun);
      runStream.start(createdRun.id, { k: createdRun.k, itemCount: runPack?.item_count });
    } catch (exc) {
      setError(errorMessage(exc));
    }
  }

  // Rerun the SAME agent: the closed learning loop feeds prior-run lessons back
  // in, so the agent gets another shot and the run-over-run comparison shows movement.
  function rerunAgent() {
    if (!selectedCandidateId) return;
    void startRunForCandidate(selectedCandidateId);
  }

  // Apply Assay's auto-refined agent.md and test it as a new candidate (history kept).
  async function testImproved() {
    const refined = agentSpec?.agent_markdown?.trim();
    if (!refined) return;
    const baselineRunId = scorecard?.run_id ?? run?.id ?? null;
    setError(null);
    resetRunArtifacts();
    runStream.reset();
    setRun(null);
    setIntakeSubmitting(true);
    setSubmittedMarkdown(refined);
    try {
      const intake = await assayApi.candidateFromMarkdown(refined, `${candidate?.name ?? "Agent"} v2`);
      const created = intake.candidate;
      setStaticLint(intake.static_lint ?? null);
      setExtraCandidates((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSelectedCandidateId(created.id);
      markCandidateListsStale(queryClient);
      if (intake.exam_available === false) {
        setLintOnly({ name: created.name, reason: intake.exam_unavailable_reason ?? "The guardrail exam needs a model key on the Assay server." });
        return;
      }
      const packId = selectedExamPack?.id ?? selectedExamPackId ?? "guardrail-v1";
      const createdRun = await assayApi.createRun(created.id, packId, null, baselineRunId, {
        policyName: runPolicy?.name,
        competencyThreshold: runPolicy?.competencyThreshold
      });
      markRunListsStale(queryClient);
      const runPack = examPacks.find((pack) => pack.id === createdRun.exam_pack_id) ?? selectedExamPack;
      setRun(createdRun);
      runStream.start(createdRun.id, { k: createdRun.k, itemCount: runPack?.item_count });
    } catch (exc) {
      setError(errorMessage(exc));
    } finally {
      setIntakeSubmitting(false);
    }
  }

  async function openTraceDrawer() {
    const runId = scorecard?.run_id ?? run?.id;
    if (!runId) {
      setDrawerOpen(true);
      return;
    }
    const hasCurrentTrace = trace?.run_id === runId;
    if (!hasCurrentTrace) {
      setError(null);
      try {
        const traceEvents = await assayApi.events(runId);
        setEvents(traceEvents);
        setTrace({ run_id: runId, events: traceEvents, scorecard });
      } catch (exc) {
        setError(errorMessage(exc));
      }
    }
    setDrawerOpen(true);
  }

  // Phase drives the calm, single-focus primary surface: intake → judging → verdict
  // (or intake → lint-only when the server cannot run the exam).
  const runEnded = runStream.status === "failed" || runStream.status === "canceled";
  const phase: "intake" | "running" | "verdict" | "lint" = scorecard
    ? "verdict"
    : isRunning || runEnded
      ? "running"
      : lintOnly
        ? "lint"
        : "intake";

  return (
    <main className="assay-shell">
      <div className="assay-stage">
        {phase === "intake" && apiUnreachable && (
          <div className="assay-api-down" role="alert">
            <strong>Can&rsquo;t reach the Assay API.</strong> Start the backend
            (<code>.\scripts\start-dev.ps1</code> or <code>npm run dev:api</code>), then reload -
            uploads won&rsquo;t run until it&rsquo;s up.
          </div>
        )}
        {phase === "intake" && (
          <>
            <AgentIntake
              examPackName={selectedExamPack?.name ?? "the exam"}
              liveMode={Boolean(health?.openai_configured)}
              submitting={intakeSubmitting}
              templates={AGENT_TEMPLATES}
              onRun={runAgentMarkdown}
            />
            <Landing
              onStart={() => {
                const el = document.querySelector<HTMLTextAreaElement>(".assay-textarea");
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
                el?.focus();
              }}
            />
          </>
        )}
        {phase === "running" && !runEnded && (
          <JudgingWaterfall
            status={runStream.status}
            events={runStream.events}
            gradedCount={runStream.gradedCount}
            totalExpected={runStream.totalExpected}
            progress={runStream.progress}
            agentName={candidate?.name ?? "your agent"}
            onCancel={cancelRun}
          />
        )}
        {phase === "running" && runEnded && (
          <div className="assay-failcard" role="alert">
            <div className="assay-failcard-head">
              <AlertTriangle size={18} />
              {runStream.status === "canceled" ? "Run canceled" : "The run hit an error"}
            </div>
            {error && <p className="assay-failcard-msg">{error}</p>}
            <div className="assay-failcard-actions">
              {selectedCandidateId && runStream.status !== "canceled" && (
                <button type="button" className="assay-run-button slim" onClick={rerunAgent}>
                  <RotateCcw size={16} /> Try again
                </button>
              )}
              <button type="button" className="assay-ghost-button" onClick={testAnother}>
                Back to start
              </button>
            </div>
          </div>
        )}
        {phase === "lint" && lintOnly && (
          <LintOnlyResult name={lintOnly.name} reason={lintOnly.reason} report={staticLint} onBack={testAnother} />
        )}
        {phase === "verdict" && scorecard && (
          <VerdictPanel
            scorecard={scorecard}
            agentSpec={agentSpec}
            agentName={candidate?.name ?? scorecard.run_id}
            deployability={deployability}
            staticLint={staticLint}
            originalMarkdown={submittedMarkdown || undefined}
            onViewTrace={openTraceDrawer}
            onTestAnother={testAnother}
            onRerun={rerunAgent}
            onTestImproved={testImproved}
          />
        )}
        {error && phase === "intake" && (
          <p className="assay-error" role="alert">{error}</p>
        )}
      </div>

      {drawerOpen && (
        <TraceDrawer
          events={events}
          trace={trace}
          scorecard={scorecard}
          proofBundle={null}
          agentSpec={agentSpec}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
        />
      )}
    </main>
  );
}

export default HomeClient;
