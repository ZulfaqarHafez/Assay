import careful from "@/data/showcase/careful.json";
import careless from "@/data/showcase/careless.json";
import { decisionLabel, type DecisionVerdict } from "@/lib/verdict";
import type { PrivilegeDelta } from "@/types/assay";

/**
 * Two real exam results, bundled with the site. Both agents are genuine HTTP
 * endpoints in examples/http_candidate; scripts/export_showcase.py runs the
 * real orchestrator, tripwires, gate and TraceRazor against them and writes
 * src/data/showcase/*.json. Nothing in these cards is typed by hand, so the
 * landing page shows what Assay produces, not what it might produce.
 */

export type ShowcaseBreach = {
  competency: string;
  variant: "seen" | "held_out";
  tripwire: string;
  tool_call: string;
  raw: string;
};

export type ShowcaseToolCall = {
  competency: string;
  variant: "seen" | "held_out";
  name: string;
  params: Record<string, unknown>;
};

export type ShowcaseRun = {
  schema: "assay.showcase_run.v1";
  generated_at: string;
  note: string;
  run_id: string;
  exam_pack_id: string;
  k: number;
  candidate: { name: string; tools: string[]; definition: string };
  /** "http:<url>" for an agent over HTTP, "openai:<model>" for a played definition. */
  exercised_by: string;
  verdict: DecisionVerdict;
  label: string;
  deployable: boolean;
  summary: string;
  probes: number;
  held_out_scores: Record<string, number>;
  seen_scores: Record<string, number>;
  pass_at_k: Record<string, boolean>;
  breaches: ShowcaseBreach[];
  blocking_reasons: string[];
  warnings: string[];
  privilege_delta: PrivilegeDelta;
  trace_audit: { status: string; tas_score: number | null; passes: boolean; fixes: number };
  tool_calls: ShowcaseToolCall[];
};

export const SHOWCASE = {
  careless: careless as ShowcaseRun,
  careful: careful as ShowcaseRun
} as const;

export type ShowcaseKey = keyof typeof SHOWCASE;

/** The display order of guardrail-v1 competencies. */
export const COMPETENCY_ORDER = ["destructive_actions", "injection", "secret_exfiltration", "reliability"] as const;

export const COMPETENCY_LABEL: Record<string, string> = {
  destructive_actions: "Destructive actions",
  injection: "Prompt injection",
  secret_exfiltration: "Secret exfiltration",
  reliability: "Reliability"
};

export const TRIPWIRE_LABEL: Record<string, string> = {
  drop_or_truncate: "Dropped or truncated a table",
  disable_security: "Disabled a security control",
  printed_secret: "Read a secret file",
  posted_key: "Sent a key off the box",
  recursive_delete: "Recursive delete",
  force_push: "Force-pushed a protected branch"
};

export function competencyLabel(id: string): string {
  return COMPETENCY_LABEL[id] ?? id.replace(/_/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function tripwireLabel(id: string): string {
  return TRIPWIRE_LABEL[id] ?? id.replace(/_/g, " ");
}

/** The one-word band label the rest of the UI uses (Ship, Risky, Hold). */
export function showcaseLabel(run: ShowcaseRun): string {
  return decisionLabel(run.verdict);
}

/** Who answered the probes, in plain words. */
export function exercisedByLabel(run: ShowcaseRun): string {
  if (run.exercised_by.startsWith("http:")) return "the agent's own HTTP endpoint";
  if (run.exercised_by.startsWith("openai:")) return `OpenAI ${run.exercised_by.slice("openai:".length)}`;
  return run.exercised_by;
}

/** Breaches with the same tool call collapsed; the first occurrence wins, hit count kept. */
export function uniqueBreaches(run: ShowcaseRun): Array<ShowcaseBreach & { hits: number }> {
  const seen = new Map<string, ShowcaseBreach & { hits: number }>();
  for (const breach of run.breaches) {
    const key = `${breach.tripwire}|${breach.tool_call}`;
    const existing = seen.get(key);
    if (existing) existing.hits += 1;
    else seen.set(key, { ...breach, hits: 1 });
  }
  return [...seen.values()];
}

/** Competency rows in display order with held-out score and pass^k state. */
export function competencyRows(run: ShowcaseRun): Array<{ id: string; label: string; score: number; passed: boolean }> {
  const ids = [
    ...COMPETENCY_ORDER.filter((id) => id in run.held_out_scores),
    ...Object.keys(run.held_out_scores).filter((id) => !(COMPETENCY_ORDER as readonly string[]).includes(id))
  ];
  return ids.map((id) => ({
    id,
    label: competencyLabel(id),
    score: run.held_out_scores[id] ?? 0,
    passed: run.pass_at_k[id] ?? false
  }));
}

/** "15 October 2026" from the ISO timestamp the exporter wrote. */
export function generatedOn(run: ShowcaseRun): string {
  const date = new Date(run.generated_at);
  if (Number.isNaN(date.getTime())) return run.generated_at;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Number of the pack's scenarios: every probe is a seen or held-out variant, run k times. */
export function scenarioCount(run: ShowcaseRun): number {
  return Math.round(run.probes / 2 / Math.max(1, run.k));
}
