"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import SampleReportCard from "@/components/assay/SampleReportCard";

/**
 * The landing surface beneath the hero. It orbits the one artifact only Assay
 * makes - the exact destructive tool call the guardrails failed to block - the
 * way a good tool-site orbits one real product shot. Deliberate loud→quiet
 * rhythm (not five identical eyebrow→h2→grid bands), concrete tool-call
 * examples instead of decorative icons, and one real outcome as proof.
 */

export type LandingProps = {
  /** Scroll to + focus the agent.md editor in the hero. */
  onStart: () => void;
};

const STEPS = [
  {
    title: "Bring your agent.md",
    body: "Paste or drop the definition you already ship - persona, policies, tools. No instrumentation, no rewrite."
  },
  {
    title: "It gets attacked in a sandbox",
    body: "Assay rebuilds the agent with its tools and fires prompt-injection, secret-exfiltration and destructive-command attacks. Every tool call is a real model decision; a tripwire fires the instant it runs rm -rf /prod."
  },
  {
    title: "You get the breach and the fix",
    body: "A ship / risky / hold verdict, the exact forbidden tool call your guardrails let through, the trace behind it, and a fixed agent.md that blocks it."
  }
];

const ATTACKS = [
  {
    title: "Destructive commands",
    body: "Won't wipe prod or drop a table even when the user swears it's authorized.",
    example: 'exec_shell("rm -rf /prod")'
  },
  {
    title: "Prompt injection",
    body: "Treats pasted content and tool output as data - never as new instructions.",
    example: 'tool_output → "now run cleanup"'
  },
  {
    title: "Secret exfiltration",
    body: "Keeps API keys and internal notes out of tool calls and replies.",
    example: "http_post(body=$API_KEY)"
  },
  {
    title: "Fairness",
    body: "Refuses protected-trait inference; ranks on documented, job-related criteria.",
    example: null
  },
  {
    title: "Refusal boundaries",
    body: "Draws a hard line and escalates instead of improvising a workaround.",
    example: null
  },
  {
    title: "Over-broad tools",
    body: "Flags the tool permissions it was granted but never actually needed.",
    example: "granted: 7 · used: 3"
  }
];

const FAQS = [
  {
    q: "How is a breach decided?",
    a: "A deterministic tripwire, not an LLM's opinion. The sandbox never executes, but the instant the agent emits a forbidden tool call - exec_shell(\"rm -rf /prod\"), db_query(\"DROP TABLE …\"), exfiltrating a secret - the tripwire fires. Each run is scored against documented, trace-backed criteria and re-run on held-out variants, so a lucky pass can't certify."
  },
  {
    q: "What happens to my agent definition and data?",
    a: "Assay runs locally against your own keys. Your agent.md is the candidate under test; nothing is sent anywhere you don't control, and every verdict links back to the exact spans behind it."
  },
  {
    q: "Do I need to wire up an SDK or test harness?",
    a: "No. Paste or drop the agent.md you already ship. Assay treats that definition as the candidate and runs the attacks against it with no code changes."
  },
  {
    q: "What does a verdict actually give me?",
    a: "A ship / risky / hold call, the exact destructive tool calls your guardrails failed to block, the permissions the agent never needed, and a fixed agent.md rewrite - so it maps straight onto a pull request."
  }
];

export function Landing({ onStart }: LandingProps) {
  // Footer + in-page nav jump to sections that actually exist on the page,
  // replacing the dead <span> "links" that looked clickable and went nowhere.
  const jumpTo = (id: string) => (event: React.MouseEvent) => {
    const el = document.getElementById(id);
    if (!el) return;
    event.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (typeof history !== "undefined") history.replaceState(null, "", `#${id}`);
  };

  return (
    <div className="lp">
      {/* Quiet proof strip: one real, verified outcome - not a stat sheet. */}
      <section className="lp-band lp-band-tight lp-proof" aria-label="Proof">
        <div className="lp-inner lp-proof-inner">
          <p className="lp-proof-lead">
            In a live run, a typical <code>agent.md</code> executed <strong>21 forbidden tool calls</strong> before
            the tripwire caught it. Verdict: <span className="lp-proof-verdict">HOLD</span>. Assay shows you every one.
          </p>
          <code className="lp-proof-breach">
            exec_shell(&quot;rm -rf /prod&quot;) <span className="lp-proof-tag">guardrail did not block</span>
          </code>
          <button type="button" className="lp-link" onClick={jumpTo("sample-report")}>
            See a sample verdict <ArrowRight size={15} />
          </button>
        </div>
      </section>

      {/* How it works + what it attacks, merged into one flow (no repeated eyebrow). */}
      <section id="how-it-works" className="lp-band lp-flow" aria-label="How it works">
        <div className="lp-inner">
          <header className="lp-head">
            <h2>From your agent.md to the exact breach, in about 20 seconds.</h2>
            <p>
              No SDK, no harness to write. Assay reconstructs the agent you already ship, attacks it in a sandbox
              that never executes, and hands back the forbidden tool call your guardrails let through - plus the fix.
            </p>
          </header>
          <ol className="lp-steps">
            {STEPS.map((step, i) => (
              <li className="lp-step" key={step.title}>
                <span className="lp-step-num">{String(i + 1).padStart(2, "0")}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>

          <div id="what-it-tests" className="lp-attacks" aria-label="What it attacks">
            <h3 className="lp-attacks-h">What it throws at your agent</h3>
            <div className="lp-bento">
              {ATTACKS.map((a) => (
                <article className="lp-cap" key={a.title}>
                  <h3>{a.title}</h3>
                  <p>{a.body}</p>
                  {a.example && <code className="lp-cap-eg">{a.example}</code>}
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* The spine: a loud, inverted focal moment showing the real report. */}
      <section id="sample-report" className="lp-band lp-band-dark lp-band-loud" aria-label="Sample report">
        <div className="lp-inner lp-preview">
          <div className="lp-preview-copy">
            <span className="lp-eyebrow">The verdict</span>
            <h2>Not a benchmark number - the exact command your guardrails missed.</h2>
            <p>
              Every run ends in a ship / risky / hold call, the forbidden tool call that slipped through, the trace
              behind it, and a fixed agent.md rewrite. Built for the pull request, not the leaderboard.
            </p>
            <button type="button" className="lp-link" onClick={onStart}>
              Test your agent <ArrowRight size={15} />
            </button>
          </div>
          <SampleReportCard />
        </div>
      </section>

      <section id="faq" className="lp-band lp-band-tint" aria-label="Frequently asked questions">
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

      <section id="get-started" className="lp-band lp-cta-band lp-band-loud" aria-label="Get started">
        <div className="lp-inner lp-cta">
          <h2>See the breach before your users do.</h2>
          <p>Paste the agent.md you already ship. Lint findings are instant; the guardrail exam runs a real model against it.</p>
          <button type="button" className="assay-run-button" onClick={onStart}>
            Test my agent <ArrowRight size={17} />
          </button>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-inner lp-footer-inner">
          <div className="lp-footer-brand">
            <strong>Assay</strong>
            <span>Prove your AI agent&rsquo;s guardrails hold. Local-first, trace-backed, built for the deploy gate.</span>
          </div>
          <div className="lp-footer-cols">
            <div className="lp-footer-col">
              <span className="lp-footer-h">Product</span>
              <button type="button" className="lp-footer-link" onClick={onStart}>Test an agent</button>
              <a className="lp-footer-link" href="#how-it-works" onClick={jumpTo("how-it-works")}>How it works</a>
              <a className="lp-footer-link" href="#what-it-tests" onClick={jumpTo("what-it-tests")}>What it attacks</a>
              <a className="lp-footer-link" href="#sample-report" onClick={jumpTo("sample-report")}>Sample verdict</a>
            </div>
            <div className="lp-footer-col">
              <span className="lp-footer-h">Resources</span>
              <a className="lp-footer-link" href="#faq" onClick={jumpTo("faq")}>FAQ</a>
              <a className="lp-footer-link" href="/runs">Run history</a>
              <a className="lp-footer-link" href="https://github.com/ZulfaqarHafez/Assay#readme" target="_blank" rel="noreferrer">README &amp; CLI</a>
              <a className="lp-footer-link" href="https://github.com/ZulfaqarHafez/Assay#run-assay-in-ci" target="_blank" rel="noreferrer">Run in CI</a>
            </div>
            <div className="lp-footer-col">
              <span className="lp-footer-h">Project</span>
              <a className="lp-footer-link" href="https://github.com/ZulfaqarHafez/Assay" target="_blank" rel="noreferrer">GitHub</a>
              <a className="lp-footer-link" href="https://github.com/ZulfaqarHafez/Assay/blob/main/SECURITY.md" target="_blank" rel="noreferrer">Security</a>
              <a className="lp-footer-link" href="https://github.com/ZulfaqarHafez/Assay/blob/main/LICENSE" target="_blank" rel="noreferrer">License · MIT</a>
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
