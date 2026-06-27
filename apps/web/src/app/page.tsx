"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  PanelRightOpen,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  X
} from "lucide-react";
import { interviuApi } from "@/lib/api";
import type { AgentResearch, AgentSpec, CandidateConfig, Connector, ConnectorProbe, DatabaseHealth, ExamPack, ExamPackExport, ExamPackFileExport, JobScope, ProductReview, ProductReviewer, ProofBundle, RoleAnalysis, RunEvent, RunRecord, Scorecard, TracePayload } from "@/types/interviu";

type LoadState = "idle" | "loading" | "running" | "complete" | "error";

export default function Home() {
  const [health, setHealth] = useState<{ ok: boolean; tracerazor_importable: boolean; database_backend?: string } | null>(null);
  const [databaseHealth, setDatabaseHealth] = useState<DatabaseHealth | null>(null);
  const [examPacks, setExamPacks] = useState<ExamPack[]>([]);
  const [selectedExamPackId, setSelectedExamPackId] = useState("hr-v1");
  const [examPackExport, setExamPackExport] = useState<ExamPackExport | null>(null);
  const [examPackFileExport, setExamPackFileExport] = useState<ExamPackFileExport | null>(null);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [connectorProbes, setConnectorProbes] = useState<ConnectorProbe[]>([]);
  const [recentRuns, setRecentRuns] = useState<RunRecord[]>([]);
  const [candidates, setCandidates] = useState<CandidateConfig[]>([]);
  const [candidate, setCandidate] = useState<CandidateConfig | null>(null);
  const [candidateName, setCandidateName] = useState("HTTP Candidate");
  const [candidateEndpoint, setCandidateEndpoint] = useState("");
  const [candidateModel, setCandidateModel] = useState("");
  const [run, setRun] = useState<RunRecord | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [trace, setTrace] = useState<TracePayload | null>(null);
  const [proofBundle, setProofBundle] = useState<ProofBundle | null>(null);
  const [productReview, setProductReview] = useState<ProductReview | null>(null);
  const [agentSpec, setAgentSpec] = useState<AgentSpec | null>(null);
  const [agentExport, setAgentExport] = useState<{ run_id: string; directory: string; sub_agent_count: number } | null>(null);
  const [agentResearch, setAgentResearch] = useState<AgentResearch | null>(null);
  const [researchBusy, setResearchBusy] = useState<"fast" | "deep" | null>(null);
  const [jobScopeText, setJobScopeText] = useState("");
  const [roleAnalysis, setRoleAnalysis] = useState<RoleAnalysis | null>(null);
  const [roleBusy, setRoleBusy] = useState(false);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [httpCandidateOpen, setHttpCandidateOpen] = useState(false);

  useEffect(() => {
    void loadBoot();
  }, []);

  const latestCompetency = useMemo(() => {
    const graded = [...events].reverse().find((event) => event.event_type === "response_graded");
    return String(graded?.payload.competency ?? "waiting");
  }, [events]);

  const passValues = Object.values(scorecard?.pass_at_k ?? {});
  const passedCount = passValues.filter(Boolean).length;
  const runLabel = scorecard?.certified ? "Passed" : scorecard ? "Needs review" : run?.status ?? "Ready";
  const spriteKind = state === "running"
    ? "candidate-review"
    : scorecard?.certified
      ? "candidate-approved"
      : scorecard
        ? "candidate-alert"
        : idleSpriteForPack(selectedExamPackId);
  const selectedExamPack = examPacks.find((pack) => pack.id === selectedExamPackId) ?? examPacks[0];
  const totalCount = passValues.length || (selectedExamPack?.items.length ?? 5);
  const probeById = useMemo(() => Object.fromEntries(connectorProbes.map((probe) => [probe.id, probe])), [connectorProbes]);
  const activationItems = useMemo(() => connectorProbes.filter((probe) => probe.status !== "pass").slice(0, 5), [connectorProbes]);
  const proofBundleHref = useMemo(
    () => (proofBundle ? `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(proofBundle, null, 2))}` : null),
    [proofBundle]
  );
  const proofBundleFilename = proofBundle ? `interviu-${proofBundle.run.id}-proof-bundle.json` : "interviu-proof-bundle.json";
  const examExportRows = examPackExport?.huggingface.files["data/interviu_exam_rows.jsonl"] ?? [];
  const examExportHref = examPackExport
    ? `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(examPackExport, null, 2))}`
    : null;
  const examExportFilename = examPackExport ? `interviu-${examPackExport.pack.id}-exam-pack.json` : "interviu-exam-pack.json";
  const rosterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const event of events) {
      counts[event.actor] = (counts[event.actor] ?? 0) + 1;
    }
    return counts;
  }, [events]);
  const roster = useMemo(
    () => buildRoster(state === "running", rosterCounts, scorecard, selectedExamPack?.simulator_model),
    [state, rosterCounts, scorecard, selectedExamPack?.simulator_model]
  );
  const workflow = useMemo(
    () => buildWorkflow(state, scorecard, agentSpec, roleAnalysis, passedCount, totalCount),
    [state, scorecard, agentSpec, roleAnalysis, passedCount, totalCount]
  );
  const reviewers = useMemo(
    () => productReview?.reviewers ?? buildReviewers(state, scorecard, health, databaseHealth, proofBundle),
    [productReview, state, scorecard, health, databaseHealth, proofBundle]
  );
  const agentMarkdownHref = useMemo(
    () => (agentSpec ? `data:text/markdown;charset=utf-8,${encodeURIComponent(agentSpec.agent_markdown)}` : null),
    [agentSpec]
  );
  const agentMarkdownFilename = agentSpec ? `interviu-${agentSpec.run_id}-AGENTS.md` : "AGENTS.md";

  async function loadBoot() {
    setState("loading");
    setError(null);
    try {
      const [healthPayload, dbHealthPayload, packsPayload, connectorsPayload, probePayload, candidatesPayload, runsPayload] = await Promise.all([
        interviuApi.health(),
        interviuApi.databaseHealth(),
        interviuApi.examPacks(),
        interviuApi.connectors(),
        interviuApi.connectorProbes(),
        interviuApi.candidates(),
        interviuApi.runs()
      ]);
      setHealth(healthPayload);
      setDatabaseHealth(dbHealthPayload);
      setExamPacks(packsPayload);
      if (packsPayload.length && !packsPayload.some((pack) => pack.id === selectedExamPackId)) {
        setSelectedExamPackId(packsPayload[0].id);
      }
      setConnectors(connectorsPayload);
      setConnectorProbes(probePayload);
      setRecentRuns(runsPayload);
      setCandidates(candidatesPayload);
      setCandidate((currentCandidate) => {
        const stillAvailable = currentCandidate ? candidatesPayload.find((item) => item.id === currentCandidate.id) : null;
        return stillAvailable ?? candidatesPayload.find((item) => item.adapter_type === "mock") ?? candidatesPayload[0] ?? null;
      });
      setState("idle");
    } catch (exc) {
      setError(errorMessage(exc));
      setState("error");
    }
  }

  async function refreshConnectorProbes() {
    setError(null);
    try {
      const probePayload = await interviuApi.connectorProbes();
      setConnectorProbes(probePayload);
    } catch (exc) {
      setError(errorMessage(exc));
    }
  }

  async function prepareExamPackExport(packId = selectedExamPackId) {
    setError(null);
    try {
      const exportPayload = await interviuApi.examPackExport(packId);
      setExamPackExport(exportPayload);
    } catch (exc) {
      setError(errorMessage(exc));
    }
  }

  async function writeExamPackFiles(packId = selectedExamPackId) {
    setError(null);
    try {
      const exportPayload = await interviuApi.examPackFileExport(packId);
      setExamPackFileExport(exportPayload);
    } catch (exc) {
      setError(errorMessage(exc));
    }
  }

  async function registerHttpCandidate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const endpoint = candidateEndpoint.trim();
    if (!endpoint) {
      setError("Add an HTTP endpoint URL before registering a candidate.");
      return;
    }
    setError(null);
    try {
      const createdCandidate = await interviuApi.createCandidate({
          name: candidateName.trim() || "HTTP Candidate",
        adapter_type: "http",
        endpoint_url: endpoint,
        model: candidateModel.trim() || null,
        metadata: { source: "web-candidate-dock" }
      });
      setCandidates((currentCandidates) => [
        createdCandidate,
        ...currentCandidates.filter((item) => item.id !== createdCandidate.id)
      ]);
      setCandidate(createdCandidate);
      setCandidateEndpoint("");
      setHttpCandidateOpen(false);
    } catch (exc) {
      setError(errorMessage(exc));
    }
  }

  function useLocalStarterCandidate() {
    setCandidateName("Local Starter Candidate");
    setCandidateEndpoint("http://127.0.0.1:8080/ask");
    setCandidateModel("example-http-candidate");
    setError(null);
  }

  async function startDemoRun() {
    setState("running");
    setError(null);
    setEvents([]);
    setScorecard(null);
    setTrace(null);
    setProofBundle(null);
    setProductReview(null);
    setAgentSpec(null);
    setAgentExport(null);
    setAgentResearch(null);
    try {
      const activeCandidate =
        candidate ??
        (await interviuApi.createCandidate({
          name: "Demo Candidate",
          adapter_type: "mock",
          metadata: { source: "web" }
        }));
      setCandidate(activeCandidate);
      setCandidates((currentCandidates) => [
        activeCandidate,
        ...currentCandidates.filter((item) => item.id !== activeCandidate.id)
      ]);
      const jobScope = jobScopeText.trim() ? buildJobScope(jobScopeText.trim()) : null;
      const createdRun = await interviuApi.createRun(activeCandidate.id, selectedExamPack?.id ?? selectedExamPackId ?? "hr-v1", jobScope);
      setRun(createdRun);
      const result = await interviuApi.startRun(createdRun.id);
      setScorecard(result);
      setState("complete");
      const [eventPayload, tracePayload, bundlePayload, reviewPayload, runsPayload] = await Promise.all([
        interviuApi.events(createdRun.id),
        interviuApi.trace(createdRun.id),
        interviuApi.proofBundle(createdRun.id),
        interviuApi.reviewers(createdRun.id),
        interviuApi.runs()
      ]);
      setEvents(eventPayload);
      setTrace(tracePayload);
      setProofBundle(bundlePayload);
      setProductReview(reviewPayload);
      setAgentSpec(bundlePayload.agent_spec ?? null);
      setRoleAnalysis(bundlePayload.role_analysis ?? null);
      setRecentRuns(runsPayload);
      setState("complete");
    } catch (exc) {
      setError(errorMessage(exc));
      setState("error");
    }
  }

  async function loadPersistedRun(runId: string) {
    setState("loading");
    setError(null);
    try {
      const [tracePayload, bundlePayload, reviewPayload] = await Promise.all([
        interviuApi.trace(runId),
        interviuApi.proofBundle(runId),
        interviuApi.reviewers(runId)
      ]);
      setRun(bundlePayload.run);
      setCandidate(bundlePayload.candidate);
      if (bundlePayload.candidate) {
        setCandidates((currentCandidates) => [
          bundlePayload.candidate as CandidateConfig,
          ...currentCandidates.filter((item) => item.id !== bundlePayload.candidate?.id)
        ]);
      }
      setScorecard(bundlePayload.scorecard);
      setEvents(tracePayload.events);
      setTrace(tracePayload);
      setProofBundle(bundlePayload);
      setProductReview(reviewPayload);
      setAgentSpec(bundlePayload.agent_spec ?? null);
      setRoleAnalysis(bundlePayload.role_analysis ?? null);
      setAgentExport(null);
      setAgentResearch(null);
      setDrawerOpen(true);
      setState("complete");
    } catch (exc) {
      setError(errorMessage(exc));
      setState("error");
    }
  }

  async function openTraceDrawer() {
    const runId = scorecard?.run_id ?? run?.id;
    if (!runId) {
      setDrawerOpen(true);
      return;
    }
    const hasCurrentTrace = trace?.run_id === runId;
    const hasCurrentBundle = proofBundle?.run.id === runId;
    if (!hasCurrentTrace || !hasCurrentBundle) {
      setError(null);
      try {
        const [tracePayload, bundlePayload, reviewPayload] = await Promise.all([
          interviuApi.trace(runId),
          interviuApi.proofBundle(runId),
          interviuApi.reviewers(runId)
        ]);
        setEvents(tracePayload.events);
        setTrace(tracePayload);
        setProofBundle(bundlePayload);
        setProductReview(reviewPayload);
        setAgentSpec(bundlePayload.agent_spec ?? null);
        setRoleAnalysis(bundlePayload.role_analysis ?? null);
      } catch (exc) {
        setError(errorMessage(exc));
      }
    }
    setDrawerOpen(true);
  }

  async function refreshAgentSpec() {
    const runId = scorecard?.run_id ?? run?.id;
    if (!runId) {
      setError("Run an evaluation first, then refine the agent spec.");
      return;
    }
    setError(null);
    try {
      const spec = await interviuApi.agentSpec(runId);
      setAgentSpec(spec);
      setDrawerOpen(true);
    } catch (exc) {
      setError(errorMessage(exc));
    }
  }

  async function writeAgentSpecFiles() {
    const runId = agentSpec?.run_id ?? scorecard?.run_id ?? run?.id;
    if (!runId) {
      setError("Run an evaluation first, then export the agent spec.");
      return;
    }
    setError(null);
    try {
      const exportPayload = await interviuApi.agentSpecFileExport(runId);
      setAgentExport(exportPayload);
    } catch (exc) {
      setError(errorMessage(exc));
    }
  }

  async function runResearch(mode: "fast" | "deep") {
    const runId = agentSpec?.run_id ?? scorecard?.run_id ?? run?.id;
    if (!runId) {
      setError("Run an evaluation first, then research the agent with OpenAI.");
      return;
    }
    setError(null);
    setResearchBusy(mode);
    try {
      const research = await interviuApi.agentResearch(runId, mode);
      setAgentResearch(research);
      setDrawerOpen(true);
    } catch (exc) {
      setError(errorMessage(exc));
    } finally {
      setResearchBusy(null);
    }
  }

  async function analyzeRole() {
    setError(null);
    setRoleBusy(true);
    try {
      const analysis = await interviuApi.roleAnalysis(jobScopeText.trim());
      setRoleAnalysis(analysis);
      if (analysis.recommended_exam_pack_id && examPacks.some((pack) => pack.id === analysis.recommended_exam_pack_id)) {
        setSelectedExamPackId(analysis.recommended_exam_pack_id);
      }
    } catch (exc) {
      setError(errorMessage(exc));
    } finally {
      setRoleBusy(false);
    }
  }

  async function exportProofBundle() {
    const runId = run?.id ?? scorecard?.run_id;
    if (!runId) {
      setError("Run an evaluation first, then export the proof bundle.");
      return;
    }
    setError(null);
    try {
      const bundlePayload = await interviuApi.proofBundle(runId);
      setProofBundle(bundlePayload);
      setProductReview(bundlePayload.product_review ?? null);
      downloadJson(`interviu-${runId}-proof-bundle.json`, bundlePayload);
    } catch (exc) {
      setError(errorMessage(exc));
    }
  }

  return (
    <main className="app-shell">
      <section className="arena-band workbench" aria-label="Interviu evaluation workspace">
        <div className="topbar">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <div>
              <h1>Interviu</h1>
              <p>Trace-backed evaluation workspace</p>
            </div>
          </div>
          <div className="toolbar">
            <button className="icon-button" type="button" title="Refresh" onClick={loadBoot}>
              <RefreshCw size={18} />
            </button>
            <button className="icon-button" type="button" title="Probe connectors" onClick={refreshConnectorProbes}>
              <Activity size={18} />
            </button>
            <button className="icon-button" type="button" title="Open trace drawer" onClick={openTraceDrawer}>
              <PanelRightOpen size={18} />
            </button>
            <button className="icon-button" type="button" title="Export proof bundle" onClick={exportProofBundle}>
              <Save size={18} />
            </button>
            <button className="command-button primary" type="button" onClick={startDemoRun} disabled={state === "running" || state === "loading"}>
              <Play size={18} />
              Run evaluation
            </button>
          </div>
        </div>

        <div className="cockpit-grid">
          <section className="run-brief" aria-label="current evaluation">
            <div className="run-brief-copy">
              <span className={`eyebrow ${state === "running" ? "live" : ""}`}>{state === "running" ? "Running" : runLabel}</span>
              <h2>{candidate?.name ?? "Demo Candidate"}</h2>
              <p>{selectedExamPack?.name ?? "HR screening reliability"}</p>
              <div className="brief-tags" aria-label="evaluation context">
                <span>{selectedExamPack?.items.length ?? 5} checks</span>
                <span>pass^{scorecard?.k ?? run?.k ?? 3}</span>
                <span>{scorecard?.simulator_model ?? selectedExamPack?.simulator_model ?? "deterministic simulator"}</span>
              </div>
            </div>
            <div className="candidate-zone compact">
              <div className={`sprite-sheet hero-sprite sprite-${spriteKind} ${state === "running" ? "thinking" : ""}`} aria-hidden="true" />
            </div>
          </section>

          <section className="metric-deck" aria-label="run summary">
            <MetricTile label="Outcome" value={runLabel} tone={scorecard?.certified ? "pass" : scorecard ? "warn" : "neutral"} />
            <MetricTile label="Trace score" value={traceScoreLabel(scorecard)} tone={scorecard?.trace_audit.passes ? "pass" : scorecard ? "warn" : "neutral"} />
            <MetricTile label="Transfer gap" value={scorecard ? maxTransferGap(scorecard).toFixed(2) : "0.00"} tone={scorecard && maxTransferGap(scorecard) <= (scorecard.thresholds.max_transfer_gap ?? 0.2) ? "pass" : "neutral"} />
            <MetricTile label="Storage" value={health?.database_backend ?? "sqlite"} tone={databaseHealth?.ok === false ? "warn" : "neutral"} />
          </section>

          <section className="evidence-panel" aria-label="evaluation evidence">
            <div className="panel-head">
              <span className="roster-title">
                <Bot size={16} /> Evaluation panel {state === "running" ? "working" : scorecard ? "complete" : "ready"}
              </span>
              <div className="badges" aria-label="pass at k progress">
                {Array.from({ length: totalCount }).map((_, index) => {
                  const isKnown = index < passValues.length;
                  const passed = passValues[index];
                  return (
                    <span className={`badge ${isKnown ? (passed ? "pass" : "fail") : ""}`} key={index}>
                      {isKnown ? (passed ? "P" : "F") : index + 1}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="workflow-strip" aria-label="evaluation workflow">
              {workflow.map((item) => (
                <div className={`workflow-card ${item.state}`} key={item.key}>
                  <span className={`sprite-sheet ${item.sheet} workflow-sprite sprite-${item.sprite}`} aria-hidden="true" />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.meta}</small>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="focus-panel" aria-label="current focus">
            <span>Current focus</span>
            <strong>{labelize(latestCompetency)}</strong>
            <small>{run?.id ?? "No run started"}</small>
            <div className="focus-facts">
              <div>
                <span>Gate</span>
                <strong>{passedCount}/{totalCount}</strong>
              </div>
              <div>
                <span>Threshold</span>
                <strong>{Math.round((scorecard?.thresholds.competency ?? 0.8) * 100)}%</strong>
              </div>
              <div>
                <span>Judge variance</span>
                <strong>{scorecard ? scorecard.grader_disagreement.toFixed(2) : "0.00"}</strong>
              </div>
            </div>
          </section>

          <section className="agent-roster evidence-panel" aria-label="interview agent panel">
            <div className="roster-track">
              {roster.map((agent) => (
                <div className={`roster-agent ${agent.state}`} key={agent.key} title={agent.title}>
                  <span
                    className={`sprite-sheet ${agent.sheet} roster-sprite sprite-${agent.sprite} ${agent.state === "active" ? "thinking" : ""}`}
                    aria-hidden="true"
                  />
                  <span className="roster-name">{agent.label}</span>
                  <span className="roster-meta">{agent.meta}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="status-strip">
          <Metric label="Run" value={run?.id ?? "Not started"} />
          <Metric label="Checks" value={`${passedCount}/${totalCount}`} />
          <Metric label="Trace audit" value={traceStatus(scorecard)} />
          <Metric label="Storage" value={health?.database_backend ?? "sqlite"} />
        </div>
      </section>

      <aside className="side-panel" aria-label="evaluation controls">
        <section className="panel-section setup-section">
          <h2 className="section-title">Run setup</h2>
          <div className="candidate-dock-card">
            <span className={`sprite-sheet mini-sprite ${candidateDockSprite(candidate)}`} aria-hidden="true" />
            <span>
              <strong>{candidate?.name ?? "No candidate selected"}</strong>
              <small>{candidate?.adapter_type ?? "mock"}{candidate?.endpoint_url ? ` / ${candidate.endpoint_url}` : ""}</small>
            </span>
            <span className={`pill ${candidate?.adapter_type === "http" ? "connected" : "ready"}`}>
              {candidate?.adapter_type ?? "none"}
            </span>
          </div>
          <label className="field-row">
            <span>Candidate</span>
            <select
              value={candidate?.id ?? ""}
              onChange={(event) => {
                setCandidate(candidates.find((item) => item.id === event.target.value) ?? null);
              }}
            >
              {candidates.length ? (
                candidates.map((item) => (
                  <option value={item.id} key={item.id}>{item.name} / {item.adapter_type}</option>
                ))
              ) : (
                <option value="">No candidates loaded</option>
              )}
            </select>
          </label>
          <label className="field-row">
            <span>Exam pack</span>
            <select
              value={selectedExamPackId}
              onChange={(event) => {
                setSelectedExamPackId(event.target.value);
                setExamPackExport(null);
                setExamPackFileExport(null);
              }}
            >
              {examPacks.map((pack) => (
                <option value={pack.id} key={pack.id}>{pack.name}</option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Job scope</span>
            <textarea
              className="job-scope-input"
              value={jobScopeText}
              onChange={(event) => setJobScopeText(event.target.value)}
              placeholder="Paste a role or job scope, for example: Screen and rank candidates fairly; parse resume uploads; handle SSNs and medical notes."
              rows={3}
            />
          </label>
          <button className="command-button" type="button" onClick={analyzeRole} disabled={roleBusy || !jobScopeText.trim()}>
            <Sparkles size={16} />
            {roleBusy ? "Analyzing..." : "Analyze role"}
          </button>
          <details
            className="setup-details"
            open={httpCandidateOpen}
            onToggle={(event) => setHttpCandidateOpen(event.currentTarget.open)}
          >
            <summary>
              <Plus size={16} />
              Add HTTP candidate
            </summary>
            <div className="candidate-form-tools">
              <button className="command-button" type="button" onClick={useLocalStarterCandidate}>
                <Activity size={16} />
                Use local starter
              </button>
            </div>
            <form className="candidate-form" onSubmit={registerHttpCandidate}>
              <label className="field-row">
                <span>Name</span>
                <input
                  value={candidateName}
                  onChange={(event) => setCandidateName(event.target.value)}
                  placeholder="HTTP Candidate"
                />
              </label>
              <label className="field-row">
                <span>Endpoint</span>
                <input
                  value={candidateEndpoint}
                  onChange={(event) => setCandidateEndpoint(event.target.value)}
                  placeholder="http://127.0.0.1:8080/ask"
                  inputMode="url"
                />
              </label>
              <label className="field-row">
                <span>Model tag</span>
                <input
                  value={candidateModel}
                  onChange={(event) => setCandidateModel(event.target.value)}
                  placeholder="optional"
                />
              </label>
              <button className="command-button" type="submit">
                <Plus size={16} />
                Add HTTP
              </button>
            </form>
          </details>
        </section>

        <section className="panel-section">
          <h2 className="section-title">Decision logic</h2>
          {roleAnalysis ? (
            <>
              <p className="refinery-headline">
                Role needs <strong>{roleAnalysis.requirements.length}</strong> competenc{roleAnalysis.requirements.length === 1 ? "y" : "ies"} /
                pack <strong>{roleAnalysis.recommended_exam_pack_id}</strong>
                {roleAnalysis.supplemental_pack_ids.length ? ` (+${roleAnalysis.supplemental_pack_ids.join(", ")})` : ""} /{" "}
                <span className="pill ready">{roleAnalysis.extraction_status}</span>
              </p>
              {roleAnalysis.requirements.map((req) => (
                <div className="decision-row" key={req.competency}>
                  <div className="decision-head">
                    <strong>{labelize(req.competency)}</strong>
                    <span className={`pill ${req.priority === "recommended" ? "ready" : "planned"}`}>
                      {req.priority === "recommended" ? "required" : "optional"}
                    </span>
                    {!req.covered_by_pack && <span className="pill warn">not tested</span>}
                  </div>
                  <p>{req.rationale}</p>
                  {req.sources.length > 0 && (
                    <div className="decision-sources">
                      {req.sources.slice(0, 3).map((source, index) => (
                        <em key={`${index}-${source.phrase}`}>&ldquo;{source.phrase}&rdquo;</em>
                      ))}
                    </div>
                  )}
                  <small className="decision-meta">
                    {req.expected_check_ids.length} check{req.expected_check_ids.length === 1 ? "" : "s"}
                    {req.recommended_subagent_id ? ` / ${req.recommended_subagent_id}` : ""}
                  </small>
                </div>
              ))}
              {roleAnalysis.compliance_notes.length > 0 && (
                <div className="failure-row">
                  <strong>Compliance guard:</strong>
                  <ul className="decision-compliance">
                    {roleAnalysis.compliance_notes.map((note, index) => (
                      <li key={`${index}-${note}`}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
              {roleAnalysis.uncovered_competencies.length > 0 && (
                <p className="refinery-note">Not yet tested: {roleAnalysis.uncovered_competencies.join(", ")}</p>
              )}
            </>
          ) : (
            <p className="refinery-note">
              Add a job scope above and click &ldquo;Analyze role&rdquo; to see which competencies, checks, and helpers the role needs, with reasons.
            </p>
          )}
        </section>

        <section className="panel-section">
          <h2 className="section-title">Score</h2>
          <div className={`score-hero ${scorecard?.certified ? "passed" : scorecard ? "review" : ""}`}>
            <span>{scorecard?.certified ? "Passed" : scorecard ? "Needs review" : "Not run yet"}</span>
            {scorecard?.certified ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          </div>
          {Object.entries(scorecard?.competency_scores ?? emptyCompetencies(selectedExamPack)).slice(0, 5).map(([name, value]) => (
            <div className="bar-row" key={name}>
              <span>{labelize(name)}</span>
              <div className="bar-track" aria-label={`${name} score`}>
                <div className="bar-fill" style={{ width: `${Math.round(value * 100)}%` }} />
              </div>
              <strong>{Math.round(value * 100)}</strong>
            </div>
          ))}
        </section>

        <section className="panel-section">
          <h2 className="section-title">Proof</h2>
          <div className="connector-row">
            <span>Trace score</span>
            <strong>{traceScoreLabel(scorecard)}</strong>
          </div>
          <div className="connector-row">
            <span>Status</span>
            <strong>{traceAuditStatus(scorecard, health?.tracerazor_importable)}</strong>
          </div>
          <div className="connector-row">
            <span>Transfer gap</span>
            <strong>{scorecard ? maxTransferGap(scorecard).toFixed(2) : "0.00"}</strong>
          </div>
          <div className="library-actions">
            <button className="command-button" type="button" onClick={openTraceDrawer}>
              <PanelRightOpen size={16} />
              View trace
            </button>
            <button className="command-button" type="button" onClick={exportProofBundle}>
              <Save size={16} />
              Export proof
            </button>
          </div>
        </section>

        <section className="panel-section">
          <h2 className="section-title">Reviewers</h2>
          <div className="reviewer-list">
            {reviewers.map((reviewer) => (
              <div className={`reviewer-row ${reviewer.status}`} key={reviewer.key}>
                <span className={`sprite-sheet mini-sprite sprite-${reviewer.sprite}`} aria-hidden="true" />
                <span>
                  <strong>{reviewer.name}</strong>
                  <small>{reviewer.summary}</small>
                </span>
                <span className={`pill ${reviewer.status === "pass" ? "ready" : reviewer.status === "warn" ? "warn" : "planned"}`}>
                  {reviewer.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <h2 className="section-title">Coaching plan</h2>
          {agentSpec ? (
            <>
              <div className={`score-hero ${refineryHeroClass(agentSpec.readiness)}`}>
                <span className="refinery-verdict">
                  <Sparkles size={16} /> {readinessLabel(agentSpec.readiness)}
                </span>
                <span className={`sprite-sheet mini-sprite sprite-${readinessSprite(agentSpec.readiness)}`} aria-hidden="true" />
              </div>
              <p className="refinery-headline">{agentSpec.headline}</p>
              <div className="refinery-stats">
                <Metric label="Strengths" value={String(agentSpec.strengths.length)} />
                <Metric label="Gaps" value={String(agentSpec.gaps.length)} />
                <Metric label="Helpers" value={String(agentSpec.sub_agents.length)} />
              </div>
              {agentSpec.sub_agents.length > 0 && (
                <div className="subagent-rail">
                  {agentSpec.sub_agents.slice(0, 4).map((sub) => (
                    <div className="subagent-chip" key={sub.id} title={sub.trigger}>
                      <span className={`sprite-sheet mini-sprite sprite-${sub.sprite}`} aria-hidden="true" />
                      <span className="subagent-chip-copy">
                        <strong>{sub.name}</strong>
                        <small>{sub.focus}</small>
                      </span>
                      <span className={`pill ${sub.priority === "recommended" ? "ready" : "planned"}`}>
                        {sub.priority === "recommended" ? "rec" : "opt"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="library-actions">
                <button className="command-button" type="button" onClick={openTraceDrawer}>
                  <Bot size={16} />
                  View plan
                </button>
                {agentMarkdownHref && (
                  <a className="command-button" href={agentMarkdownHref} download={agentMarkdownFilename}>
                    <Save size={16} />
                    Export spec
                  </a>
                )}
                <button className="command-button" type="button" onClick={writeAgentSpecFiles}>
                  <Save size={16} />
                  Write files
                </button>
              </div>
              <div className="library-actions">
                <button
                  className="command-button"
                  type="button"
                  onClick={() => runResearch("fast")}
                  disabled={researchBusy !== null}
                  title="One OpenAI reasoning call grounded in this run"
                >
                  <Sparkles size={16} />
                  {researchBusy === "fast" ? "Researching..." : "OpenAI research"}
                </button>
                <button
                  className="command-button"
                  type="button"
                  onClick={() => runResearch("deep")}
                  disabled={researchBusy !== null}
                  title="OpenAI web-search deep research; can take a few minutes"
                >
                  <Sparkles size={16} />
                  {researchBusy === "deep" ? "Deep researching..." : "Deep research (web)"}
                </button>
              </div>
              {agentResearch && agentResearch.status !== "ok" && (
                <p className="refinery-note">
                  OpenAI research {agentResearch.status}: {agentResearch.message}
                </p>
              )}
              {agentExport && (
                <div className="artifact-card">
                  <span>Agent export</span>
                  <strong>{agentExport.sub_agent_count} helper files</strong>
                  <small>{agentExport.directory}</small>
                </div>
              )}
            </>
          ) : (
            <div className="refinery-empty">
              <p>Run an evaluation to create a coaching plan and focused helper recommendations.</p>
              <button className="command-button" type="button" onClick={refreshAgentSpec} disabled={!scorecard && !run}>
                <Sparkles size={16} />
                Build plan
              </button>
            </div>
          )}
        </section>

        <details className="panel-section quiet-details">
          <summary>Exam export</summary>
          <div className="connector-row">
            <span>{selectedExamPack?.id ?? "no-pack"}</span>
            <strong>{selectedExamPack?.items.length ?? 0} items</strong>
          </div>
          <div className="connector-row">
            <span>Dataset rows</span>
            <strong>{examExportRows.length || ((selectedExamPack?.items.length ?? 0) * 2)}</strong>
          </div>
          <div className="library-actions">
            <button className="command-button" type="button" onClick={() => prepareExamPackExport()}>
              <Save size={16} />
              Prepare export
            </button>
            <button className="command-button" type="button" onClick={() => writeExamPackFiles()}>
              <Save size={16} />
              Write files
            </button>
            {examExportHref && (
              <a className="command-button" href={examExportHref} download={examExportFilename}>
                <Save size={16} />
                Save pack
              </a>
            )}
          </div>
          {examPackFileExport && (
            <div className="artifact-card">
              <span>Local export</span>
              <strong>{examPackFileExport.row_count} rows</strong>
              <small>{examPackFileExport.directory}</small>
            </div>
          )}
        </details>

        <details className="panel-section quiet-details">
          <summary>Recent runs</summary>
          {recentRuns.length ? (
            recentRuns.slice(0, 5).map((item) => (
              <button className="ledger-row" type="button" key={item.id} onClick={() => loadPersistedRun(item.id)}>
                <span className={`sprite-sheet mini-sprite sheet-runs sprite-${runSprite(item.status)}`} aria-hidden="true" />
                <span>
                  <strong>{item.id}</strong>
                  <small>{item.status} / {item.exam_pack_id}</small>
                </span>
                <span>{item.k}x</span>
              </button>
            ))
          ) : (
            <div className="connector-row">No stored runs yet</div>
          )}
          {proofBundle && (
            <div className="proof-summary">
              <span>Bundle</span>
              <strong>{proofBundle.summary.event_count} spans / {proofBundle.summary.trace_status}</strong>
            </div>
          )}
        </details>

        <details className="panel-section quiet-details">
          <summary>System details</summary>
          {activationItems.length ? (
            activationItems.map((item) => (
              <div className="activation-row" key={item.id}>
                <span className={`probe-dot ${item.status}`} aria-hidden="true" />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.next_step ?? item.evidence}</small>
                </span>
                <em>{item.status}</em>
              </div>
            ))
          ) : (
            <div className="connector-row">All connector checks pass</div>
          )}
          {connectors.map((connector) => {
            const probe = probeById[connector.id] ?? (connector.id === "supabase" ? probeById.supabase : null);
            return (
              <div className="connector-card" key={connector.id}>
                <div className="connector-card-main">
                  <span className="connector-copy">
                    <span className={`sprite-sheet mini-sprite ${connectorIcon(connector.id)}`} aria-hidden="true" />
                    <span>
                      <strong>{connector.name}</strong>
                      <small>{connector.description}</small>
                    </span>
                  </span>
                  <span className={`pill ${connector.status}`}>{connector.status}</span>
                </div>
                {probe && (
                  <div className="probe-line">
                    <span className={`probe-dot ${probe.status}`} aria-hidden="true" />
                    <span>{probe.evidence}</span>
                    <strong>{probe.status}</strong>
                  </div>
                )}
              </div>
            );
          })}
        </details>

        {(scorecard?.failure_reasons.length || error) ? (
          <section className="panel-section">
            <h2 className="section-title">Needs attention</h2>
            {scorecard?.failure_reasons.map((failure, index) => (
              <div className="failure-row" key={`${index}-${failure}`}>{failure}</div>
            ))}
            {error && <p className="error-text">{error}</p>}
          </section>
        ) : null}
      </aside>

      {drawerOpen && (
        <TraceDrawer
          events={events}
          trace={trace}
          scorecard={scorecard}
          proofBundle={proofBundle}
          proofBundleHref={proofBundleHref}
          proofBundleFilename={proofBundleFilename}
          databaseHealth={databaseHealth}
          agentSpec={agentSpec}
          agentMarkdownHref={agentMarkdownHref}
          agentMarkdownFilename={agentMarkdownFilename}
          agentExport={agentExport}
          agentResearch={agentResearch}
          onWriteAgentFiles={writeAgentSpecFiles}
          onExport={exportProofBundle}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "pass" | "warn" }) {
  return (
    <div className={`metric-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TraceDrawer({
  events,
  trace,
  scorecard,
  proofBundle,
  proofBundleHref,
  proofBundleFilename,
  databaseHealth,
  agentSpec,
  agentMarkdownHref,
  agentMarkdownFilename,
  agentExport,
  agentResearch,
  onWriteAgentFiles,
  onExport,
  onClose
}: {
  events: RunEvent[];
  trace: TracePayload | null;
  scorecard: Scorecard | null;
  proofBundle: ProofBundle | null;
  proofBundleHref: string | null;
  proofBundleFilename: string;
  databaseHealth: DatabaseHealth | null;
  agentSpec: AgentSpec | null;
  agentMarkdownHref: string | null;
  agentMarkdownFilename: string;
  agentExport: { run_id: string; directory: string; sub_agent_count: number } | null;
  agentResearch: AgentResearch | null;
  onWriteAgentFiles: () => void;
  onClose: () => void;
  onExport: () => void;
}) {
  const audit = scorecard?.trace_audit;
  return (
    <aside className="drawer" aria-label="trace drawer">
      <div className="drawer-header">
        <div>
          <h2 className="section-title">Trace</h2>
          <strong>{trace?.run_id ?? "No run selected"}</strong>
        </div>
        <div className="drawer-actions">
          {proofBundleHref ? (
            <a className="icon-button" title="Download proof bundle" href={proofBundleHref} download={proofBundleFilename}>
              <Save size={18} />
            </a>
          ) : (
            <button className="icon-button" type="button" title="Export proof bundle" onClick={onExport}>
              <Save size={18} />
            </button>
          )}
          <button className="icon-button" type="button" title="Close trace drawer" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="connector-row">
        <span><Activity size={16} /> TraceRazor {audit?.status ?? "pending"}</span>
        <strong>{audit?.grade ?? "no grade"}</strong>
      </div>
      <div className="connector-row">
        <span><ShieldCheck size={16} /> transfer_gap</span>
        <strong>{scorecard ? maxTransferGap(scorecard).toFixed(2) : "0.00"}</strong>
      </div>
      <div className="connector-row">
        <span>Database health</span>
        <strong>{databaseHealth?.backend ?? "unknown"} / {databaseHealth?.ok ? "ok" : "pending"}</strong>
      </div>
      <div className="connector-row">
        <span>Proof bundle</span>
        <strong>{proofBundle ? `${proofBundle.summary.event_count} spans` : "not exported"}</strong>
      </div>
      {agentSpec && (
        <section className="drawer-refinery">
          <div className="drawer-refinery-head">
            <span className="refinery-verdict">
              <Sparkles size={16} /> Coaching plan / {readinessLabel(agentSpec.readiness)}
            </span>
            <div className="drawer-actions">
              {agentMarkdownHref && (
                <a className="icon-button" title="Download operating notes" href={agentMarkdownHref} download={agentMarkdownFilename}>
                  <Save size={18} />
                </a>
              )}
              <button className="icon-button" type="button" title="Write coaching files" onClick={onWriteAgentFiles}>
                <Bot size={18} />
              </button>
            </div>
          </div>
          <p className="refinery-headline">{agentSpec.headline}</p>
          {agentSpec.tracerazor_actions.length > 0 && (
            <ul className="refinery-actions">
              {agentSpec.tracerazor_actions.map((action, index) => (
                <li key={`${index}-${action}`}>{action}</li>
              ))}
            </ul>
          )}
          {agentSpec.sub_agents.length > 0 && (
            <div className="subagent-grid">
              {agentSpec.sub_agents.map((sub) => (
                <article className="subagent-card" key={sub.id}>
                  <header>
                    <span className={`sprite-sheet mini-sprite sprite-${sub.sprite}`} aria-hidden="true" />
                    <span>
                      <strong>{sub.name}</strong>
                      <small>{sub.role}</small>
                    </span>
                    <span className={`pill ${sub.priority === "recommended" ? "ready" : "planned"}`}>{sub.priority}</span>
                  </header>
                  <p>{sub.trigger}</p>
                  <div className="subagent-meta">
                    <span>{sub.focus}</span>
                    <span>{sub.tools.join(", ") || "no extra tools"}</span>
                  </div>
                  <a
                    className="command-button"
                    href={`data:text/markdown;charset=utf-8,${encodeURIComponent(sub.definition_markdown)}`}
                    download={`${sub.id}.md`}
                  >
                    <Save size={16} />
                    {sub.id}.md
                  </a>
                </article>
              ))}
            </div>
          )}
          <details className="quiet-details drawer-md">
            <summary>Operating notes</summary>
            <pre>{agentSpec.agent_markdown}</pre>
          </details>
          {agentExport && (
            <div className="artifact-card">
              <span>Agent export</span>
              <strong>{agentExport.sub_agent_count} helper files</strong>
              <small>{agentExport.directory}</small>
            </div>
          )}
        </section>
      )}
      {agentResearch && (
        <section className="drawer-research">
          <div className="drawer-refinery-head">
            <span className="refinery-verdict">
              <Sparkles size={16} /> OpenAI research ({agentResearch.mode})
            </span>
            <span className="pill ready">{agentResearch.model ?? agentResearch.status}</span>
          </div>
          {agentResearch.status !== "ok" ? (
            <p className="error-text">{agentResearch.status}: {agentResearch.message}</p>
          ) : (
            <>
              <p className="refinery-headline">{agentResearch.summary}</p>
              {agentResearch.recommended_tools.length > 0 && (
                <div className="connector-row">
                  <span>Tools</span>
                  <strong>{agentResearch.recommended_tools.join(", ")}</strong>
                </div>
              )}
              {agentResearch.recommended_subagents.length > 0 && (
                <div className="subagent-grid">
                  {agentResearch.recommended_subagents.map((idea) => (
                    <article className="subagent-card" key={idea.name}>
                      <header>
                        <span className="sprite-sheet mini-sprite sprite-candidate" aria-hidden="true" />
                        <span>
                          <strong>{idea.name}</strong>
                          <small>{idea.purpose}</small>
                        </span>
                      </header>
                    </article>
                  ))}
                </div>
              )}
              {agentResearch.risks.length > 0 && (
                <ul className="refinery-actions">
                  {agentResearch.risks.map((risk, index) => (
                    <li key={`${index}-${risk}`}>{risk}</li>
                  ))}
                </ul>
              )}
              {agentResearch.sources.length > 0 && (
                <div className="research-sources">
                  <span className="section-title">Sources</span>
                  {agentResearch.sources.map((source) => (
                    <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                      {source.title || source.url}
                    </a>
                  ))}
                </div>
              )}
              <details className="quiet-details drawer-md">
                <summary>Research brief</summary>
                <pre>{agentResearch.brief_markdown}</pre>
              </details>
            </>
          )}
        </section>
      )}
      {(events.length ? events : trace?.events ?? []).map((event) => (
        <article className="event-row" key={event.span_id}>
          <header>
            <span>{event.sequence}. {event.actor} / {event.event_type}</span>
            <span>{event.tracerazor_step_id ? `TR ${event.tracerazor_step_id}` : "span"}</span>
          </header>
          <pre>{JSON.stringify(event.payload, null, 2)}</pre>
        </article>
      ))}
    </aside>
  );
}

function emptyCompetencies(pack?: ExamPack): Record<string, number> {
  const names = pack?.items.map((item) => item.competency) ?? [
    "compliance",
    "fairness",
    "ambiguity_handling",
    "refusal_boundaries",
    "interview_ethics"
  ];
  return Object.fromEntries(Array.from(new Set(names)).map((name) => [name, 0]));
}

function idleSpriteForPack(packId: string) {
  return packId.includes("injection") ? "candidate-proof" : "candidate-ready";
}

function labelize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function traceStatus(scorecard: Scorecard | null) {
  if (!scorecard) {
    return "pending";
  }
  const audit = scorecard.trace_audit;
  return audit.tas_score === null || audit.tas_score === undefined
    ? audit.status
    : `${audit.tas_score.toFixed(0)} ${audit.grade ?? ""}`.trim();
}

function traceScoreLabel(scorecard: Scorecard | null) {
  const audit = scorecard?.trace_audit;
  if (!audit) return "Pending";
  if (audit.tas_score !== null && audit.tas_score !== undefined) return audit.tas_score.toFixed(1);
  if (audit.status === "error" || audit.status === "unavailable") return "Not scored";
  if (audit.status === "insufficient_steps") return "Insufficient";
  return "Pending";
}

function traceAuditStatus(scorecard: Scorecard | null, traceRazorImportable?: boolean) {
  const status = scorecard?.trace_audit.status;
  if (status) return labelize(status);
  return traceRazorImportable ? "Ready" : "Unavailable";
}

function maxTransferGap(scorecard: Scorecard) {
  return Math.max(0, ...Object.values(scorecard.transfer_gap));
}

function connectorIcon(id: string) {
  if (id.includes("supabase")) return "sprite-supabase";
  if (id.includes("hugging")) return "sprite-hugging-face";
  if (id.includes("vercel")) return "sprite-vercel";
  if (id.includes("trace")) return "sprite-tracerazor";
  if (id.includes("http")) return "sprite-http-antenna";
  if (id.includes("mcp")) return "sprite-mcp-plug";
  if (id.includes("openai")) return "sprite-model-chip";
  if (id.includes("local")) return "sprite-local-command";
  return "sprite-candidate";
}

function candidateDockSprite(candidate: CandidateConfig | null) {
  if (candidate?.adapter_type === "http") return "sprite-http-antenna";
  if (candidate?.adapter_type === "mcp-server") return "sprite-mcp-plug";
  if (candidate?.adapter_type === "local-command") return "sprite-local-command";
  if (candidate?.adapter_type === "openai-compatible") return "sprite-model-chip";
  return "sprite-candidate";
}

type WorkflowStage = {
  key: string;
  label: string;
  meta: string;
  sprite: string;
  sheet: string;
  state: "idle" | "active" | "done" | "attention";
};

function buildWorkflow(
  state: LoadState,
  scorecard: Scorecard | null,
  agentSpec: AgentSpec | null,
  roleAnalysis: RoleAnalysis | null,
  passedCount: number,
  totalCount: number
): WorkflowStage[] {
  const hasRun = scorecard !== null;
  const hasCoaching = agentSpec !== null || roleAnalysis !== null;
  return [
    {
      key: "prepare",
      label: "Prepare",
      meta: roleAnalysis ? `${roleAnalysis.requirements.length} role checks` : "candidate and role",
      sprite: roleAnalysis ? "lesson-pinned" : "run-queued",
      sheet: roleAnalysis ? "sheet-lessons" : "sheet-runs",
      state: state === "idle" && !hasRun ? "active" : "done"
    },
    {
      key: "evaluate",
      label: "Evaluate",
      meta: state === "running" ? "exam in progress" : hasRun ? `${passedCount}/${totalCount} checks` : "not started",
      sprite: state === "running" ? "run-running" : hasRun ? "run-complete" : "timeline-node",
      sheet: "sheet-runs",
      state: state === "running" ? "active" : hasRun ? "done" : "idle"
    },
    {
      key: "judge",
      label: "Judge",
      meta: scorecard ? (scorecard.certified ? "passed" : "needs review") : "waiting",
      sprite: scorecard?.certified ? "grader-approve" : scorecard ? "grader-reject" : "grader-deliberating",
      sheet: "sheet-judging",
      state: scorecard ? (scorecard.certified ? "done" : "attention") : state === "running" ? "active" : "idle"
    },
    {
      key: "teach",
      label: "Teach",
      meta: agentSpec ? readinessLabel(agentSpec.readiness) : "coaching next",
      sprite: agentSpec ? "lesson-applied" : "lesson-book",
      sheet: "sheet-lessons",
      state: hasCoaching ? "done" : scorecard ? "active" : "idle"
    }
  ];
}

function buildReviewers(
  state: LoadState,
  scorecard: Scorecard | null,
  health: { ok: boolean; tracerazor_importable: boolean; database_backend?: string } | null,
  databaseHealth: DatabaseHealth | null,
  proofBundle: ProofBundle | null
): ProductReviewer[] {
  const traceStatus = scorecard?.trace_audit.status;
  const runtimeWarn = state === "error" || databaseHealth?.ok === false || traceStatus === "error";
  const proofReady = scorecard?.certified && scorecard.trace_audit.status === "ok";
  return [
    {
      key: "experience",
      name: "UX reviewer",
      summary: scorecard ? "workflow, score, and coaching are visible" : "room is ready for a first run",
      sprite: "candidate-document",
      status: scorecard ? "pass" : "wait",
      label: scorecard ? "clear" : "ready",
      evidence: []
    },
    {
      key: "runtime",
      name: "Runtime reviewer",
      summary: runtimeWarn
        ? traceStatus === "error"
          ? "TraceRazor needs attention"
          : "local service needs attention"
        : `${health?.database_backend ?? "sqlite"} storage responding`,
      sprite: runtimeWarn ? "candidate-alert" : "candidate-shield",
      status: runtimeWarn ? "warn" : "pass",
      label: runtimeWarn ? "check" : "stable",
      evidence: []
    },
    {
      key: "evidence",
      name: "Evidence reviewer",
      summary: proofReady
        ? "proof bundle and audit passed"
        : scorecard
          ? "proof bundle records the review reasons"
          : proofBundle
            ? "proof bundle is available"
            : "waiting for scorecard",
      sprite: proofReady ? "candidate-approved" : scorecard ? "candidate-review" : "candidate-audit",
      status: proofReady ? "pass" : scorecard ? "warn" : "wait",
      label: proofReady ? "passed" : scorecard ? "review" : "waiting",
      evidence: []
    },
  ];
}

type RosterAgent = {
  key: string;
  label: string;
  sprite: string;
  sheet: string;
  state: "idle" | "active" | "done";
  meta: string;
  title: string;
};

function buildRoster(
  running: boolean,
  counts: Record<string, number>,
  scorecard: Scorecard | null,
  simulatorModel?: string
): RosterAgent[] {
  const roles: Array<{ key: string; label: string; sheet: string; actor: string; doneMeta: (count: number) => string }> = [
    { key: "examiner", label: "Examiner", sheet: "", actor: "examiner", doneMeta: (count) => `${count} asked` },
    { key: "grader", label: "Judge panel", sheet: "sheet-judging", actor: "grader_panel", doneMeta: (count) => `${count} graded` },
    { key: "lessons", label: "Lessons", sheet: "sheet-lessons", actor: "lesson_library", doneMeta: (count) => `${count} kept` },
    { key: "trace", label: "TraceRazor", sheet: "", actor: "trace_auditor", doneMeta: () => traceRosterMeta(scorecard) },
    { key: "sim", label: "Simulator", sheet: "", actor: "system", doneMeta: () => (simulatorModel ? "scored" : "ready") }
  ];
  return roles.map((role) => {
    const count = counts[role.actor] ?? 0;
    const state: RosterAgent["state"] = running ? "active" : count > 0 ? "done" : "idle";
    const meta = running ? "working" : count > 0 ? role.doneMeta(count) : "idle";
    return {
      key: role.key,
      label: role.label,
      sprite: rosterSprite(role.key, running, count, scorecard),
      sheet: role.sheet,
      state,
      meta,
      title: `${role.label}: ${meta}`
    };
  });
}

function rosterSprite(key: string, running: boolean, count: number, scorecard: Scorecard | null): string {
  if (key === "grader") {
    if (running) return "grader-deliberating";
    if (scorecard?.certified) return "grader-approve";
    if (scorecard) return "grader-reject";
    return "grader-deliberating";
  }
  if (key === "lessons") {
    if (running) return "new-lesson-stamp";
    if (count > 4) return "library-many";
    if (count > 0) return "library-few";
    return "library-empty";
  }
  const map: Record<string, string> = { examiner: "domain", trace: "tracerazor", sim: "simulator" };
  return map[key] ?? "candidate";
}

function runSprite(status: string): string {
  if (status === "running") return "run-running";
  if (status === "completed") return "run-complete";
  if (status === "failed") return "fail-bead";
  return "run-queued";
}

function buildJobScope(text: string): JobScope {
  return {
    raw_text: text,
    title: "",
    seniority: "unspecified",
    responsibilities: [],
    required_skills: [],
    nice_to_have: [],
    qualifications: [],
    domain: "",
    risks: [],
    compliance_flags: [],
    extraction: "none"
  };
}

function traceRosterMeta(scorecard: Scorecard | null) {
  const tas = scorecard?.trace_audit.tas_score;
  if (tas !== null && tas !== undefined) return `TAS ${tas.toFixed(0)}`;
  return scorecard?.trace_audit.status ?? "idle";
}

function readinessLabel(readiness: AgentSpec["readiness"]) {
  if (readiness === "ready") return "Ready to ship";
  if (readiness === "needs_subagents") return "Add helpers";
  return "Refine";
}

function readinessSprite(readiness: AgentSpec["readiness"]) {
  if (readiness === "ready") return "candidate-approved";
  if (readiness === "needs_subagents") return "candidate-question";
  return "candidate-review";
}

function refineryHeroClass(readiness: AgentSpec["readiness"]) {
  return readiness === "ready" ? "passed" : "review";
}

function downloadJson(filename: string, payload: unknown) {
  if (typeof window === "undefined") {
    return;
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function errorMessage(exc: unknown) {
  return exc instanceof Error ? exc.message : "Unknown Interviu error";
}
