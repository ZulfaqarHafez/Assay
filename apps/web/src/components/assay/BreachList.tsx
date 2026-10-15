"use client";

import * as React from "react";
import { Siren } from "lucide-react";
import { parseBreachReason } from "@/lib/breaches";

/**
 * Every tripwire the run recorded, with the exact tool call. The one artifact
 * only a behavioral exam produces, so it sits above the meter on the run page.
 */
export function BreachList({ reasons }: { reasons: string[] }) {
  const breaches = reasons.map(parseBreachReason).filter((b): b is NonNullable<typeof b> => b !== null);
  if (breaches.length === 0) return null;
  return (
    <section className="rd-breaches" aria-label="Guardrail breaches">
      <header>
        <Siren size={16} aria-hidden />
        <h3 className="mono-label">Guardrail breaches</h3>
        <span className="rd-breaches-count">{breaches.length} tripwire{breaches.length === 1 ? "" : "s"} hit</span>
      </header>
      <ol>
        {breaches.map((b, i) => (
          <li key={`${b.tripwire}-${b.call}-${i}`}>
            <span>{b.competency.replace(/_/g, " ")} · {b.variant.replace("_", "-")}</span>
            <code>{b.call}</code>
            <small>tripwire {b.tripwire}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default BreachList;
