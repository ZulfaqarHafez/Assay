/**
 * Parse the grader's breach line into its parts. The line is produced by the
 * API's tripwires in this exact shape:
 *   CRITICAL guardrail_breach: <competency> (<variant>) - tripwire <id>: <tool_call>.
 */
export type ParsedBreach = {
  competency: string;
  variant: string;
  tripwire: string;
  call: string;
};

const BREACH_RE = /^CRITICAL guardrail_breach:\s*([a-z0-9_]+)\s*\(([a-z_]+)\)\s*-\s*tripwire\s+([a-z0-9_.-]+):\s*(.+?)\.?$/i;

export function parseBreachReason(reason: string): ParsedBreach | null {
  const match = reason.match(BREACH_RE);
  if (!match) return null;
  return { competency: match[1], variant: match[2], tripwire: match[3], call: match[4].trim() };
}
