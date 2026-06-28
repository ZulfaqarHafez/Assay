"use client";

import * as React from "react";
import { FlaskConical, Upload, UploadCloud, FileText, Wrench, Hash, Sparkles, Zap } from "lucide-react";
import { detectAgentFacts } from "@/lib/assay";
import HeroScanCard from "@/components/assay/HeroScanCard";

/**
 * The calm first screen: "bring the agent.md you already have."
 *
 * Selection, not creation — the hero action is dropping/pasting an existing
 * agent definition, with detected facts reflected back instantly (the Vercel
 * "we read your config" move). Templates are the fallback, not the headline.
 */

export type AgentTemplate = {
  id: string;
  name: string;
  blurb: string;
  markdown: string;
};

export type AgentIntakeProps = {
  examPackName: string;
  /** True when an LLM key is configured, so the upload runs for real. */
  liveMode: boolean;
  submitting: boolean;
  templates: AgentTemplate[];
  onRun: (markdown: string, roleScopeText?: string) => void;
};

export function AgentIntake({ examPackName, liveMode, submitting, templates, onRun }: AgentIntakeProps) {
  const [markdown, setMarkdown] = React.useState("");
  const [roleScopeText, setRoleScopeText] = React.useState("");
  const [dragging, setDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const facts = React.useMemo(() => detectAgentFacts(markdown), [markdown]);
  const hasContent = markdown.trim().length > 0;

  const readFile = React.useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => setMarkdown(String(reader.result ?? ""));
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
        <span className="assay-kicker">Pre-deployment litmus test</span>
        <h2>Bring your <code>agent.md</code>. Find out where it breaks.</h2>
        <p>
          Drop or paste your agent&rsquo;s definition. Assay runs it through an adversarial exam, grades it,
          and hands you a ranked list of what to fix before you ship.
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
          onChange={(event) => setMarkdown(event.target.value)}
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
          accept=".md,.markdown,.txt,text/markdown,text/plain"
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

      {hasContent && (
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

      <div className="assay-intake-actions">
        <button
          type="button"
          className="assay-run-button"
          onClick={() => onRun(markdown, roleScopeText)}
          disabled={!hasContent || submitting}
        >
          <FlaskConical size={18} />
          {submitting ? "Running the litmus test…" : `Run the litmus test`}
        </button>
        <button
          type="button"
          className="assay-ghost-button"
          onClick={() =>
            document.querySelector('[aria-label="How it works"]')?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        >
          See how it works
        </button>
        <span className={`assay-mode ${liveMode ? "live" : "demo"}`}>
          {liveMode ? (
            <>
              <Zap size={13} /> Live &middot; runs against {examPackName}
            </>
          ) : (
            <>
              <Sparkles size={13} /> Demo mode &middot; add an OpenAI key to test your real agent
            </>
          )}
        </span>
      </div>

      <details className="assay-advanced">
        <summary>Role scope</summary>
        <textarea
          className="assay-scope-textarea"
          value={roleScopeText}
          onChange={(event) => setRoleScopeText(event.target.value)}
          placeholder="Support triage for refunds, account privacy, and escalation policy."
          aria-label="Role scope"
          rows={3}
        />
      </details>
        </div>
        <aside className="assay-hero-aside">
          <HeroScanCard />
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
