"use client";

import * as React from "react";
import { Wrench, CheckCircle2, Users, Copy, Download, Check, Sparkles, Activity, BadgeCheck, FlaskConical } from "lucide-react";
import { downloadText } from "@/lib/derive";
import { useAgentSpecDiff } from "@/lib/queries";
import type { AgentSpec, TraceAuditSummary, TraceRazorFix } from "@/types/assay";

/**
 * The "act on the verdict" panel. Surfaces the Agent Refinery's coaching output -
 * what to improve, what already works, recommended helpers - and the full refined
 * agent.md the user can copy/download and re-test via "Test improved version".
 */

const READINESS: Record<AgentSpec["readiness"], { label: string; tone: string }> = {
  ready: { label: "Ready", tone: "pass" },
  refine: { label: "Needs refinement", tone: "warn" },
  needs_subagents: { label: "Needs helper agents", tone: "warn" }
};

const FIX_RISK: Record<NonNullable<TraceRazorFix["risk"]>, { label: string; tone: string }> = {
  safe: { label: "safe", tone: "pass" },
  needs_review: { label: "review", tone: "warn" },
  dangerous: { label: "careful", tone: "fail" }
};

/** Whether this run's refined md has been proven by a follow-up run. */
export type ImproveValidation =
  | { state: "validated"; runId: string }
  | { state: "pending" };

export type ImprovePanelProps = {
  agentSpec: AgentSpec | null;
  agentName: string;
  /** When set, the panel fetches the server-side unified diff for this run. */
  runId?: string | null;
  originalMarkdown?: string;
  traceAudit?: TraceAuditSummary | null;
  validation?: ImproveValidation | null;
};

export function ImprovePanel({
  agentSpec,
  agentName,
  runId = null,
  originalMarkdown,
  traceAudit = null,
  validation = null
}: ImprovePanelProps) {
  const [copied, setCopied] = React.useState(false);
  const [exactDiffRequested, setExactDiffRequested] = React.useState(false);
  const diffQuery = useAgentSpecDiff(runId, {
    retry: false,
    enabled: Boolean(runId && exactDiffRequested)
  });

  if (!agentSpec) return null;

  const readiness = READINESS[agentSpec.readiness] ?? READINESS.refine;
  const refined = agentSpec.agent_markdown?.trim() ?? "";
  const original = originalMarkdown ?? agentSpec.original_markdown ?? "";
  const serverDiff = diffQuery.data ?? null;
  const fallbackPreview = refined && !serverDiff ? previewDiff(original, refined) : [];
  const fileSlug = agentName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
  const traceFixes = traceAudit?.fixes ?? [];
  const tokensSaved = traceAudit?.savings?.tokens_saved;

  async function copyRefined() {
    if (!refined || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(refined);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked - Download remains available */
    }
  }

  function requestExactDiff() {
    setExactDiffRequested(true);
    if (exactDiffRequested) {
      void diffQuery.refetch();
    }
  }

  return (
    <section className="assay-improve" aria-label="How to improve">
      <div className="assay-improve-head">
        <h3 className="assay-section-label">
          <Sparkles size={15} /> How to improve
        </h3>
        <span className="assay-improve-badges">
          {validation?.state === "validated" && (
            <a className="assay-improve-validation pass" href={`/runs/${validation.runId}`}>
              <BadgeCheck size={13} /> Validated - tested as run {validation.runId}
            </a>
          )}
          {validation?.state === "pending" && (
            <span className="assay-improve-validation warn">
              <FlaskConical size={13} /> Not yet validated - run &ldquo;Test improved version&rdquo; to prove the delta
            </span>
          )}
          <span className={`assay-improve-readiness ${readiness.tone}`}>{readiness.label}</span>
        </span>
      </div>
      {agentSpec.headline && <p className="assay-improve-headline">{agentSpec.headline}</p>}

      {agentSpec.gaps.length > 0 && (
        <div className="assay-improve-block">
          <h4><Wrench size={14} /> Fix these</h4>
          <ul className="assay-improve-list">
            {agentSpec.gaps.map((gap, index) => (
              <li key={`gap-${index}`}>{gap}</li>
            ))}
          </ul>
        </div>
      )}

      {agentSpec.strengths.length > 0 && (
        <div className="assay-improve-block">
          <h4><CheckCircle2 size={14} /> Already solid</h4>
          <ul className="assay-improve-list muted">
            {agentSpec.strengths.map((strength, index) => (
              <li key={`str-${index}`}>{strength}</li>
            ))}
          </ul>
        </div>
      )}

      {traceFixes.length > 0 && (
        <div className="assay-improve-block">
          <h4>
            <Activity size={14} /> Trace efficiency fixes
            {typeof tokensSaved === "number" && tokensSaved > 0 && (
              <span className="assay-improve-savings">~{tokensSaved.toLocaleString()} tokens/run recoverable</span>
            )}
          </h4>
          <ul className="assay-trace-fixes">
            {traceFixes.slice(0, 4).map((fix, index) => {
              const risk = FIX_RISK[fix.risk ?? "safe"] ?? FIX_RISK.safe;
              return (
                <li key={`trace-fix-${index}`}>
                  <span className="assay-trace-fix-head">
                    <strong>{fix.fix_type.replace(/_/g, " ")}</strong>
                    <code>{fix.target}</code>
                    <span className={`pill ${risk.tone === "pass" ? "ready" : risk.tone === "warn" ? "warn" : "planned"}`}>{risk.label}</span>
                    <small>~{fix.estimated_token_savings} tokens/run</small>
                  </span>
                  <small className="assay-trace-fix-patch">{fix.patch}</small>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {agentSpec.sub_agents.length > 0 && (
        <div className="assay-improve-block">
          <h4><Users size={14} /> Recommended helper agents</h4>
          <ul className="assay-improve-subagents">
            {agentSpec.sub_agents.map((sub) => (
              <li key={sub.id}>
                <strong>{sub.name}</strong>
                <span>{sub.trigger || sub.focus}</span>
                {sub.delegation_rule && <small>{sub.delegation_rule}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {refined && (
        <div className="assay-improve-refined">
          <div className="assay-improve-diff-head">
            <strong>What changed</strong>
            {serverDiff ? (
              <span>
                <em className="assay-diff-add-count">+{serverDiff.added}</em>{" "}
                <em className="assay-diff-del-count">−{serverDiff.removed}</em> vs your upload
              </span>
            ) : (
              <span>{fallbackPreview.length} changed lines previewed</span>
            )}
          </div>
          {runId && !serverDiff ? (
            <div className="assay-improve-refined-actions">
              <button
                type="button"
                className="assay-ghost-button slim"
                disabled={diffQuery.isFetching}
                onClick={requestExactDiff}
              >
                <Activity size={14} /> {diffQuery.isFetching ? "Loading diff" : diffQuery.isError ? "Retry diff" : "Exact diff"}
              </button>
            </div>
          ) : null}
          {serverDiff && !serverDiff.original_available && (
            <p className="assay-muted">
              No original agent.md is on file for this candidate - showing the full refined document as additions.
            </p>
          )}
          {serverDiff ? (
            <pre className="assay-improve-diff" aria-label="Diff against the uploaded agent.md">
              <code>
                {serverDiff.hunks.map((hunk, hunkIndex) => (
                  <React.Fragment key={`hunk-${hunkIndex}`}>
                    <span className="assay-diff-hunk">{hunk.header}</span>
                    {"\n"}
                    {hunk.lines.map((line, lineIndex) => (
                      <React.Fragment key={`line-${hunkIndex}-${lineIndex}`}>
                        <span
                          className={
                            line.op === "+" ? "assay-diff-add" : line.op === "-" ? "assay-diff-del" : "assay-diff-ctx"
                          }
                        >
                          {line.op} {line.text}
                        </span>
                        {"\n"}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))}
              </code>
            </pre>
          ) : (
            <pre className="assay-improve-diff"><code>{fallbackPreview.join("\n") || "+ Refined agent instructions generated from this run."}</code></pre>
          )}
          <div className="assay-improve-refined-actions">
            <button type="button" className="assay-ghost-button slim" onClick={copyRefined}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              className="assay-ghost-button slim"
              onClick={() => downloadText(`${fileSlug}.agent.md`, refined)}
            >
              <Download size={14} /> Download .md
            </button>
          </div>
          <details>
            <summary>View full refined AGENTS.md ({refined.split(/\n/).length} lines)</summary>
            <pre className="assay-improve-md"><code>{refined}</code></pre>
          </details>
        </div>
      )}
    </section>
  );
}

function previewDiff(original: string, refined: string) {
  const before = new Set((original || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const lines = refined.split(/\r?\n/);
  const added = lines
    .filter((line) => line.trim() && !before.has(line.trim()))
    .slice(0, 18)
    .map((line) => `+ ${line}`);
  if (added.length > 0) return added;
  return lines.slice(0, 12).map((line) => `  ${line}`);
}

export default ImprovePanel;
