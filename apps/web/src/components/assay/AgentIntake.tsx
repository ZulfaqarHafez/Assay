"use client";

import * as React from "react";
import { FlaskConical, Upload, UploadCloud, FileText, Wrench, Hash, Sparkles, Zap } from "lucide-react";
import { detectAgentFacts } from "@/lib/agentDetect";
import ShowcaseRunCard from "@/components/assay/ShowcaseRunCard";
import CopyButton from "@/components/ui/CopyButton";
import { SHOWCASE } from "@/lib/showcase";
import { INSTALL_ONE_LINER } from "@/lib/surfaces";

/**
 * The calm first screen: "bring the agent.md you already have."
 *
 * Selection, not creation - the hero action is dropping/pasting an existing
 * agent definition, with detected facts reflected back instantly (the Vercel
 * "we read your config" move). Templates are the fallback, not the headline.
 */

export type AgentTemplate = {
  id: string;
  name: string;
  blurb: string;
  markdown: string;
};

/** Deploy-gate choice made at intake; the run is judged against exactly this. */
export type IntakePolicy = {
  name: "strict" | "advisory";
  competencyThreshold: number;
};

export type AgentIntakeProps = {
  examPackName: string;
  /** True when an LLM key is configured, so the upload runs for real. */
  liveMode: boolean;
  submitting: boolean;
  templates: AgentTemplate[];
  onRun: (markdown: string, roleScopeText?: string, policy?: IntakePolicy, filename?: string) => void;
};

const STRUCTURED_EXTENSIONS = /\.(json|ya?ml|toml)$/i;

export function AgentIntake({ examPackName, liveMode, submitting, templates, onRun }: AgentIntakeProps) {
  const [markdown, setMarkdown] = React.useState("");
  const [filename, setFilename] = React.useState<string | undefined>(undefined);
  const [roleScopeText, setRoleScopeText] = React.useState("");
  const [policyName, setPolicyName] = React.useState<IntakePolicy["name"]>("strict");
  const [thresholdPct, setThresholdPct] = React.useState(80);
  const [dragging, setDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Structured configs (JSON/YAML/TOML) are normalized server-side; the local
  // facts mirror only understands markdown, so skip it for those.
  const isStructured = Boolean(filename && STRUCTURED_EXTENSIONS.test(filename)) || markdown.trimStart().startsWith("{");
  const facts = React.useMemo(() => detectAgentFacts(isStructured ? "" : markdown), [markdown, isStructured]);
  const hasContent = markdown.trim().length > 0;
  // The zero-input path: one click runs a real sample so a first-time visitor
  // sees the full intake -> judging -> verdict flow without typing anything.
  const sampleTemplate = templates[0] ?? null;

  const readFile = React.useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setMarkdown(String(reader.result ?? ""));
      setFilename(file.name);
    };
    reader.readAsText(file);
  }, []);

  const onDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) readFile(file);
    },
    [readFile]
  );

  return (
    <section className="assay-intake" aria-label="Test your agent">
      <div className="assay-hero-grid">
        <div className="assay-hero-main">
      <header className="assay-intake-head">
        <span className="assay-kicker">Behavioral guardrail exam</span>
        <h1>Prove your agent&rsquo;s guardrails actually hold.</h1>
        <p>
          Drop the <code>AGENTS.md</code> you already ship. A real model plays it with its declared tools, Assay
          runs real adversarial attacks across 21 scenarios, and deterministic tripwires report the exact forbidden
          tool call that got through, with the fix.
        </p>
      </header>

      <div
        className={`assay-dropzone ${dragging ? "dragging" : ""} ${hasContent ? "filled" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="assay-editor-bar" aria-hidden="true">
          <span className="assay-editor-dots"><i /><i /><i /></span>
          <span className="assay-editor-name">
            <FileText size={12} /> {facts.title ? `${facts.title}.md` : "agent.md"}
          </span>
        </div>
        <textarea
          className="assay-textarea"
          value={markdown}
          onChange={(event) => {
            setMarkdown(event.target.value);
            setFilename(undefined);
          }}
          placeholder={"# Support Triage Agent\n\nYou are a customer-support agent. Stay within policy, never reveal\ninternal notes, and escalate refunds over $100.\n\n## Tools\n- `lookup_order`\n- `issue_refund`\n- `escalate`"}
          spellCheck={false}
          aria-label="Agent definition markdown"
        />
        {!hasContent && (
          <button type="button" className="assay-dropzone-cta" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} /> or upload a file
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.txt,.json,.yaml,.yml,.toml,text/markdown,text/plain,application/json,application/yaml,application/toml"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) readFile(file);
          }}
        />
        {dragging && (
          <div className="assay-drop-overlay" aria-hidden="true">
            <UploadCloud size={28} />
            <span>Drop your <code>agent.md</code> to load it</span>
          </div>
        )}
      </div>

      {hasContent && isStructured && (
        <div className="assay-detected" aria-live="polite">
          <span className="assay-detected-lead">Detected</span>
          <span className="assay-chip">
            <FileText size={13} /> {filename ?? "Structured config"} - normalized on the server
          </span>
        </div>
      )}
      {hasContent && !isStructured && (
        <div className="assay-detected" aria-live="polite">
          <span className="assay-detected-lead">Detected</span>
          <span className="assay-chip">
            <FileText size={13} /> {facts.title || "Untitled agent"}
          </span>
          <span className="assay-chip">
            <Wrench size={13} /> {facts.tools.length} tool{facts.tools.length === 1 ? "" : "s"}
            {facts.tools.length ? `: ${facts.tools.slice(0, 4).join(", ")}${facts.tools.length > 4 ? "…" : ""}` : ""}
          </span>
          <span className="assay-chip">
            <Hash size={13} /> ~{facts.tokenEstimate.toLocaleString()} tokens
          </span>
        </div>
      )}

      {!liveMode && (
        <p className="assay-demo-notice" role="note">
          <Sparkles size={14} />
          <span>
            This Assay server has no model key, so this <strong>lints the definition only</strong>. The exam needs{" "}
            <code>OPENAI_API_KEY</code> on the API server, or your own agent over HTTP. Nothing is recorded as a verdict without one.
          </span>
        </p>
      )}

      <div className="assay-intake-actions">
        {hasContent ? (
          <button
            type="button"
            className="assay-run-button"
            onClick={() => onRun(markdown, roleScopeText, { name: policyName, competencyThreshold: thresholdPct / 100 }, filename)}
            disabled={submitting}
          >
            <FlaskConical size={18} />
            {submitting
              ? liveMode ? "Running the guardrail test…" : "Linting…"
              : liveMode ? "Run the guardrail test" : "Lint the definition"}
          </button>
        ) : (
          sampleTemplate && (
            // Cold load: the ONE bright button is always live - it runs a real
            // sample end-to-end, so the hero's focal control is never disabled.
            <button
              type="button"
              className="assay-run-button"
              disabled={submitting}
              onClick={() =>
                onRun(sampleTemplate.markdown, roleScopeText, { name: policyName, competencyThreshold: thresholdPct / 100 })
              }
            >
              <Zap size={18} />
              {submitting ? "Running the sample…" : liveMode ? "See a sample verdict" : "Lint the sample agent"}
            </button>
          )
        )}
        {hasContent && sampleTemplate && (
          <button
            type="button"
            className="assay-ghost-button"
            disabled={submitting}
            onClick={() =>
              onRun(sampleTemplate.markdown, roleScopeText, { name: policyName, competencyThreshold: thresholdPct / 100 })
            }
          >
            <Zap size={16} /> Run the sample instead
          </button>
        )}
        <button
          type="button"
          className="assay-text-button"
          onClick={() =>
            document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        >
          See how it works
        </button>
        {liveMode && (
          <span className="assay-mode live">
            <Zap size={13} /> Live &middot; runs against {examPackName}
          </span>
        )}
      </div>

      <details className="assay-advanced">
        <summary>
          Deploy gate: <strong>{policyName === "strict" ? "Strict" : "Advisory"} · {thresholdPct}%</strong>
          <span className="assay-advanced-hint"> - edit role scope &amp; policy</span>
        </summary>
        <textarea
          className="assay-scope-textarea"
          value={roleScopeText}
          onChange={(event) => setRoleScopeText(event.target.value)}
          placeholder="Support triage for refunds, account privacy, and escalation policy."
          aria-label="Role scope"
          rows={3}
        />
        <div className="assay-policy" aria-label="Deploy policy">
          <div className="assay-policy-toggle" role="radiogroup" aria-label="Deployability policy">
            <button
              type="button"
              role="radio"
              aria-checked={policyName === "strict"}
              className={policyName === "strict" ? "active" : ""}
              onClick={() => setPolicyName("strict")}
            >
              Strict
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={policyName === "advisory"}
              className={policyName === "advisory" ? "active" : ""}
              onClick={() => setPolicyName("advisory")}
            >
              Advisory
            </button>
          </div>
          <small className="assay-policy-hint">
            {policyName === "strict"
              ? "Strict: a failed trace audit blocks the verdict."
              : "Advisory: a failed trace audit warns instead of blocking."}
          </small>
          <label className="assay-policy-slider">
            <span>
              Pass bar <strong>{thresholdPct}%</strong> - every competency must score at least {thresholdPct}% on all held-out trials (not 100).
            </span>
            <input
              type="range"
              min={50}
              max={95}
              step={5}
              value={thresholdPct}
              onChange={(event) => setThresholdPct(Number(event.target.value))}
              aria-label="Competency pass threshold percent"
            />
          </label>
        </div>
      </details>

      <div className="assay-install" aria-label="Run it from a shell">
        <span className="assay-install-lead">Or from a shell, no key needed for lint</span>
        <div className="lp-code slim">
          <pre><code>{INSTALL_ONE_LINER}</code></pre>
          <CopyButton text={INSTALL_ONE_LINER} label="Copy the CLI command" />
        </div>
      </div>
        </div>
        <aside className="assay-hero-aside">
          <ShowcaseRunCard run={SHOWCASE.careless} variant="compact" tab="Real run" />
        </aside>
      </div>

      <div className="assay-templates">
        <span className="assay-templates-lead">No file handy? Start from a template</span>
        <div className="assay-template-row">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className="assay-template"
              onClick={() => setMarkdown(template.markdown)}
            >
              <strong>{template.name}</strong>
              <small>{template.blurb}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default AgentIntake;
