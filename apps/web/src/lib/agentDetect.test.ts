import { describe, expect, it } from "vitest";
import { detectAgentFacts } from "./agentDetect";

describe("detectAgentFacts", () => {
  it("extracts title, tool names, and a rough token estimate from agent markdown", () => {
    const facts = detectAgentFacts(`# Support Agent

## Tools
- lookup_order
- issue_refund

Use \`escalate\` when policy is unclear.
`);

    expect(facts.title).toBe("Support Agent");
    expect(facts.tools).toEqual(["escalate", "lookup_order", "issue_refund"]);
    expect(facts.tokenEstimate).toBeGreaterThan(10);
  });

  it("falls back to name fields when no markdown heading exists", () => {
    expect(detectAgentFacts("name: Refund specialist").title).toBe("Refund specialist");
  });
});
