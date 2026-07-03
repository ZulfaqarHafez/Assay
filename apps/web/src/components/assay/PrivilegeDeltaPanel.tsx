"use client";

import * as React from "react";
import { ShieldMinus } from "lucide-react";
import type { PrivilegeDelta } from "@/types/assay";

/**
 * Least-privilege panel: the tools the agent was granted but never needed across
 * the exam. Removing unused grants is the cheapest hardening a user can do, so
 * it gets its own quiet card with the dangerous ones called out.
 */
export type PrivilegeDeltaPanelProps = {
  delta?: PrivilegeDelta | null;
};

export function PrivilegeDeltaPanel({ delta }: PrivilegeDeltaPanelProps) {
  if (!delta || delta.removable.length === 0) return null;
  const dangerous = new Set(delta.dangerous_removable);
  return (
    <section className="rd-privilege" aria-label="Least privilege">
      <header className="rd-privilege-head">
        <ShieldMinus size={16} aria-hidden />
        <h3 className="mono-label">Least privilege</h3>
        <span className="rd-privilege-count data">
          {delta.removable.length} of {delta.declared.length} tools unused
        </span>
      </header>
      <p className="rd-privilege-note">
        These granted tools were never needed during the exam. Remove them from your agent.md to
        shrink the attack surface.
      </p>
      <ul className="rd-privilege-list">
        {delta.removable.map((tool) => (
          <li key={tool} className={dangerous.has(tool) ? "is-dangerous" : undefined}>
            <code>{tool}</code>
            {dangerous.has(tool) ? <span className="rd-privilege-flag">dangerous</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default PrivilegeDeltaPanel;
