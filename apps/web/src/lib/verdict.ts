/**
 * The single source of truth for Assay's three-band verdict lexicon.
 *
 * The one opinionated call Assay makes — ship / don't-ship — used to be spelled
 * six different ways across the README, landing, runs table, run detail, the
 * deployability meter, and the sample card. Every user-facing surface now
 * renders the verdict through these constants so the words can never drift
 * screen to screen again. Canonical bands, verb-first: SHIP · RISKY · HOLD.
 */

export type VerdictBand = "ship" | "risky" | "hold";

/** The one-word band label shown in tables, badges, and meters. */
export const VERDICT_LABEL: Record<VerdictBand, string> = {
  ship: "Ship",
  risky: "Risky",
  hold: "Hold",
};

/** The sentence-y headline shown on the verdict hero. */
export const VERDICT_HEADLINE: Record<VerdictBand, string> = {
  ship: "Ready to ship",
  risky: "Ship with caution",
  hold: "Not ready yet",
};

/** Left→right labels printed under the litmus meter. */
export const VERDICT_SCALE: readonly string[] = [
  VERDICT_LABEL.hold,
  VERDICT_LABEL.risky,
  VERDICT_LABEL.ship,
];

/** Map the backend deployability verdict onto the display band. */
export function bandFromDecision(verdict: "ship" | "probation" | "do_not_ship"): VerdictBand {
  if (verdict === "ship") return "ship";
  if (verdict === "probation") return "risky";
  return "hold";
}

/** The canonical one-word label for a backend deployability decision. */
export function decisionLabel(verdict: "ship" | "probation" | "do_not_ship"): string {
  return VERDICT_LABEL[bandFromDecision(verdict)];
}
