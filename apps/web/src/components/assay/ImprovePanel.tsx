"use client";

import * as React from "react";
import { Wrench, CheckCircle2, Users, Copy, Download, Check, Sparkles } from "lucide-react";
import { downloadText } from "@/lib/derive";
import type { AgentSpec } from "@/types/assay";

/**
 * The "act on the verdict" panel. Surfaces the Agent Refinery's coaching output —
 * what to improve, what already works, recommended helpers — and the full refined
 * agent.md the user can copy/download and re-test via "Test improved version".
 */

const READINESS: Record<AgentSpec["readiness"], { label: string; tone: string }> = {
  ready: { label: "Ready", tone: "pass" },
  refine: { label: "Needs refinement", tone: "warn" },
  needs_subagents: { label: "Needs helper agents", tone: "warn" }
};

export type ImprovePanelProps = {
  agentSpec: AgentSpec | null;
  agentName: string;
};

export function ImprovePanel({ agentSpec, agentName }: ImprovePanelProps) {
  const [copied, setCopied] = React.useState(false);

  if (!agentSpec) return null;

  const readiness = READINESS[agentSpec.readiness] ?? READINESS.refine;
  const refined = agentSpec.agent_markdown?.trim() ?? "";
  const fileSlug = agentName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "agent";

  async function copyRefined() {
    if (!refined || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(refined);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — Download remains available */
    }
  }

  return (
    <section className="assay-improve" aria-label="How to improve">
      <div className="assay-improve-head">
        <h3 className="assay-section-label">
          <Sparkles size={15} /> How to improve
        </h3>
        <span className={`assay-improve-readiness ${readiness.tone}`}>{readiness.label}</span>
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
        <details className="assay-improve-refined">
          <summary>View the refined agent.md ({refined.split(/\n/).length} lines)</summary>
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
          <pre className="assay-improve-md"><code>{refined}</code></pre>
        </details>
      )}
    </section>
  );
}

export default ImprovePanel;
