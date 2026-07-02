import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import ReviewCouncil from "./ReviewCouncil";
import type { ProductReview } from "@/types/assay";

const review: ProductReview = {
  schema: "assay.product_review.v1",
  run_id: "run_demo",
  generated_at: "2026-07-01T00:00:00Z",
  reviewers: [
    {
      key: "role_analyst",
      name: "Role Analyst",
      status: "pass",
      label: "qualified",
      summary: "The judge was qualified against a role-specific brief before scoring.",
      evidence: ["Tailored role brief was used."],
      next_step: null,
      sprite: "candidate-document"
    },
    {
      key: "tracerazor_auditor",
      name: "TraceRazor Auditor",
      status: "warn",
      label: "below bar",
      summary: "TraceRazor TAS 42.0 did not pass.",
      evidence: ["TraceRazor TAS 42.0 did not pass."],
      next_step: "Apply TraceRazor fixes, rerun, and compare TAS before shipping.",
      sprite: "candidate-alert"
    },
    {
      key: "release_manager",
      name: "Release Manager",
      status: "warn",
      label: "blocked",
      summary: "This agent should not be deployed until the blocking interview findings are fixed.",
      evidence: ["fairness failed pass^3."],
      next_step: "Improve the agent, rerun the interview loop, then compare against this baseline.",
      sprite: "candidate-review"
    }
  ]
};

describe("ReviewCouncil", () => {
  it("headlines the flag count and leads with the release manager", () => {
    render(<ReviewCouncil review={review} />);
    expect(screen.getByText(/2 of 3 reviewers raised flags/i)).toBeInTheDocument();
    const names = screen.getAllByText(/Release Manager|TraceRazor Auditor|Role Analyst/).map((el) => el.textContent);
    expect(names[0]).toBe("Release Manager");
    // Warn rows come before pass rows after the release manager.
    expect(names[1]).toBe("TraceRazor Auditor");
    expect(names[2]).toBe("Role Analyst");
  });

  it("hides evidence and next step until the row is expanded", async () => {
    const user = userEvent.setup();
    render(<ReviewCouncil review={review} />);
    const nextStep = screen.getByText(/Apply TraceRazor fixes, rerun/i);
    // Present in the DOM but inside a collapsed <details>.
    expect(nextStep.closest("details")).not.toHaveAttribute("open");

    await user.click(screen.getByText("TraceRazor Auditor"));

    expect(nextStep.closest("details")).toHaveAttribute("open");
    expect(screen.getByText(/TAS 42.0 did not pass/i, { selector: "li" })).toBeInTheDocument();
  });

  it("reports all clear when nobody raises a flag", () => {
    const clear: ProductReview = {
      ...review,
      reviewers: review.reviewers.map((reviewer) => ({ ...reviewer, status: "pass" as const, label: "passed" }))
    };
    render(<ReviewCouncil review={clear} />);
    expect(screen.getByText(/All clear/i)).toBeInTheDocument();
  });
});
