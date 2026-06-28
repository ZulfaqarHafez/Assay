"use client";

import * as React from "react";
import {
  FileCode2,
  Swords,
  ListChecks,
  ShieldCheck,
  Scale,
  EyeOff,
  Crosshair,
  MessageSquareWarning,
  ArrowRight
} from "lucide-react";
import SampleReportCard from "@/components/assay/SampleReportCard";

/**
 * The landing surface beneath the hero intake. Turns the single-screen tool into
 * a real product page: a proof band, a three-step explainer, a capability bento,
 * a live-looking sample report, a closing call to action, and a footer.
 */

export type LandingProps = {
  /** Scroll to + focus the agent.md editor in the hero. */
  onStart: () => void;
};

const STATS = [
  { value: "6", label: "Failure categories tested", sub: "compliance to confidentiality" },
  { value: "20+", label: "Adversarial probes per run", sub: "seen and held-out prompts" },
  { value: "3×", label: "Held-out re-runs to certify", sub: "no single lucky pass" },
  { value: "~20s", label: "Median run, paste to verdict", sub: "no setup, no SDK" }
];

const STEPS = [
  {
    icon: FileCode2,
    title: "Bring your agent.md",
    body: "Paste or drop the definition you already ship: persona, policies, and tools. No instrumentation, no rewrite."
  },
  {
    icon: Swords,
    title: "It survives an adversarial exam",
    body: "A panel stress-tests the agent with prompt injection, protected-trait traps, and policy edge cases, then re-asks on held-out variants."
  },
  {
    icon: ListChecks,
    title: "You get a ranked list of fixes",
    body: "A ship / risky / hold verdict, a capability score, and the exact failures to fix, with the adversarial prompts and the judge's reasoning."
  }
];

const CAPABILITIES = [
  { icon: ShieldCheck, title: "Compliance", body: "Stays inside policy under pressure and refuses out-of-scope asks.", wide: true },
  { icon: Crosshair, title: "Prompt injection", body: "Treats tool output and pasted content as untrusted data, not instructions." },
  { icon: Scale, title: "Fairness", body: "Refuses protected-trait inference and ranks on documented, job-related criteria." },
  { icon: EyeOff, title: "Confidentiality", body: "Holds internal notes and sensitive data back, even when coaxed.", wide: true },
  { icon: MessageSquareWarning, title: "Refusal boundaries", body: "Draws a clear line and escalates instead of improvising." },
  { icon: ListChecks, title: "Coverage", body: "Handles ambiguity and the edge cases real users actually send." }
];

const FAQS = [
  {
    q: "How is the agent graded?",
    a: "Deterministic, trace-backed rubrics, not a single LLM judge. Each probe is scored against documented criteria, re-run on held-out variants, and gated at pass^3 so a lucky pass does not certify."
  },
  {
    q: "What happens to my agent definition and data?",
    a: "Assay runs locally against your own keys. Your agent.md is the candidate under test; nothing is sent anywhere you do not control, and every verdict links back to the exact spans behind it."
  },
  {
    q: "Do I need to wire up an SDK or test harness?",
    a: "No. Paste or drop the agent.md you already ship. Assay treats that definition as the candidate and runs the adversarial exam against it with no code changes."
  },
  {
    q: "What does a verdict actually tell me?",
    a: "A ship / risky / hold call, a capability score, and a ranked list of concrete failures with the prompts that triggered them, so it maps straight onto a pull request."
  }
];

export function Landing({ onStart }: LandingProps) {
  return (
    <div className="lp">
      <section className="lp-band lp-stats-band" aria-label="By the numbers">
        <div className="lp-inner lp-stats">
          {STATS.map((s) => (
            <div className="lp-stat" key={s.label}>
              <strong>{s.value}</strong>
              <span>{s.label}</span>
              <small>{s.sub}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-band" aria-label="How it works">
        <div className="lp-inner">
          <header className="lp-head">
            <span className="lp-eyebrow">How it works</span>
            <h2>Three steps from definition to verdict.</h2>
            <p>No SDK, no test harness to write. Assay treats the agent.md you already have as the candidate under test.</p>
          </header>
          <div className="lp-steps">
            {STEPS.map((step, i) => (
              <article className="lp-step" key={step.title}>
                <span className="lp-step-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="lp-step-icon"><step.icon size={20} /></span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-band lp-band-tint" aria-label="What it tests">
        <div className="lp-inner">
          <header className="lp-head">
            <span className="lp-eyebrow">What it tests</span>
            <h2>The failure modes that get agents pulled from production.</h2>
            <p>Every run grades the same competencies a careful red team would, and proves the agent holds the line on prompts it has never seen.</p>
          </header>
          <div className="lp-bento">
            {CAPABILITIES.map((c) => (
              <article className={`lp-cap ${c.wide ? "wide" : ""}`} key={c.title}>
                <span className="lp-cap-icon"><c.icon size={20} /></span>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-band lp-band-dark" aria-label="Sample report">
        <div className="lp-inner lp-preview">
          <div className="lp-preview-copy">
            <span className="lp-eyebrow">The report</span>
            <h2>A verdict you can act on, not a benchmark number.</h2>
            <p>
              Every run ends in a clear call and a ranked punch list: what broke, which capability it maps to,
              and the evidence behind it. Built for the pull request, not the leaderboard.
            </p>
            <button type="button" className="lp-link" onClick={onStart}>
              Test your agent <ArrowRight size={15} />
            </button>
          </div>
          <SampleReportCard />
        </div>
      </section>

      <section className="lp-band lp-band-tint" aria-label="Frequently asked questions">
        <div className="lp-inner lp-faq">
          <header className="lp-head">
            <span className="lp-eyebrow">FAQ</span>
            <h2>Questions teams ask before their first run.</h2>
          </header>
          <dl className="lp-faq-list">
            {FAQS.map((f) => (
              <div className="lp-faq-item" key={f.q}>
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="lp-band lp-cta-band" aria-label="Get started">
        <div className="lp-inner lp-cta">
          <h2>Find out where your agent breaks before your users do.</h2>
          <p>Paste an agent.md and get a verdict in about twenty seconds.</p>
          <button type="button" className="assay-run-button" onClick={onStart}>
            Start the litmus test <ArrowRight size={17} />
          </button>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-inner lp-footer-inner">
          <div className="lp-footer-brand">
            <strong>Assay</strong>
            <span>Pre-deployment litmus test for AI agents. Local-first, trace-backed, built for the deploy gate.</span>
          </div>
          <div className="lp-footer-cols">
            <div className="lp-footer-col">
              <span className="lp-footer-h">Product</span>
              <button type="button" className="lp-footer-link" onClick={onStart}>Test an agent</button>
              <span className="lp-footer-link is-static">Capabilities</span>
              <span className="lp-footer-link is-static">Sample report</span>
            </div>
            <div className="lp-footer-col">
              <span className="lp-footer-h">Resources</span>
              <span className="lp-footer-link is-static">How it works</span>
              <span className="lp-footer-link is-static">FAQ</span>
              <span className="lp-footer-link is-static">Trace format</span>
            </div>
            <div className="lp-footer-col">
              <span className="lp-footer-h">Run modes</span>
              <span className="lp-footer-link is-static">Live (your keys)</span>
              <span className="lp-footer-link is-static">Deterministic demo</span>
              <span className="lp-footer-link is-static">Evaluation cockpit</span>
            </div>
          </div>
        </div>
        <div className="lp-inner lp-footer-base">
          <span>Assay</span>
          <span>Local evaluation for agent reliability</span>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
