"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import CopyButton from "@/components/ui/CopyButton";
import { EXIT_CODES, NO_KEY_BEHAVIOUR, PIP_INSTALL, SURFACES } from "@/lib/surfaces";

/**
 * The six ways to run Assay, each with one exact command and a copy button.
 * Below them, the honest key table: what every surface does with no model key.
 */
export function SurfaceCards() {
  return (
    <div className="lp-surfaces">
      <div className="lp-surface-grid">
        {SURFACES.map((s) => (
          <article className="lp-surface" key={s.id}>
            <header>
              <h3>{s.name}</h3>
              <span className={`lp-surface-key ${s.key}`}>{s.key === "none" ? "no key" : "key for the exam"}</span>
            </header>
            <p>{s.use}</p>
            <div className="lp-code">
              <pre><code>{s.command}</code></pre>
              <CopyButton text={s.command} label={`Copy the ${s.name} command`} />
            </div>
            {s.docs ? (
              <a className="lp-surface-doc" href={s.docs.href} target="_blank" rel="noreferrer">
                {s.docs.label} <ExternalLink size={12} />
              </a>
            ) : null}
          </article>
        ))}
      </div>

      <div className="lp-pip">
        <span>Python package (the name on PyPI belongs to another project, so install from the release):</span>
        <div className="lp-code slim">
          <pre><code>{PIP_INSTALL}</code></pre>
          <CopyButton text={PIP_INSTALL} label="Copy the pip install command" />
        </div>
      </div>

      <div className="lp-keytable-wrap">
        <div className="lp-keytable">
          <h3>Without a model key</h3>
          <p>Lint, packs, stored runs, refine, proof bundles and doctor work without one. The exam does not start, and nothing is recorded as a verdict.</p>
          <dl>
            {NO_KEY_BEHAVIOUR.map((row) => (
              <div key={row.surface}>
                <dt>{row.surface}</dt>
                <dd>{row.behaviour}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="lp-keytable">
          <h3>CLI exit codes</h3>
          <p>Gate a pipeline on the number, not on a log line.</p>
          <dl>
            {EXIT_CODES.map((row) => (
              <div key={row.code}>
                <dt><code>{row.code}</code></dt>
                <dd>{row.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

export default SurfaceCards;
