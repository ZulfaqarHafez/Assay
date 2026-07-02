"use client";

import * as React from "react";
import { Wrench, ShieldQuestion } from "lucide-react";
import Sprite from "@/components/ui/Sprite";
import type { DeployabilityDecision, ProductReview, ProductReviewer } from "@/types/assay";

/**
 * The Preflight Council, made useful: flagged reviewers first, evidence and the
 * concrete next step expandable per row, and the Release Manager cross-checked
 * against the live deployability decision so the two never silently disagree.
 */

const STATUS_ORDER: Record<ProductReviewer["status"], number> = { warn: 0, wait: 1, pass: 2 };

export type ReviewCouncilProps = {
  review: ProductReview;
  decision?: DeployabilityDecision | null;
};

export function ReviewCouncil({ review, decision = null }: ReviewCouncilProps) {
  const releaseManager = review.reviewers.find((reviewer) => reviewer.key === "release_manager") ?? null;
  const others = review.reviewers
    .filter((reviewer) => reviewer.key !== "release_manager")
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const ordered = releaseManager ? [releaseManager, ...others] : others;

  const flagged = review.reviewers.filter((reviewer) => reviewer.status !== "pass").length;
  const headline =
    flagged === 0
      ? "All clear — no reviewer raised a flag."
      : `${flagged} of ${review.reviewers.length} reviewers raised flags.`;

  // A stale council (e.g. cached bundle) can disagree with the live decision.
  const releaseSaysBlocked = releaseManager?.label === "blocked";
  const decisionDisagrees =
    decision != null && releaseManager != null && releaseSaysBlocked === decision.deployable;

  return (
    <section className="panel-section review-council" aria-label="reviewers">
      <header className="review-council-head">
        <h2 className="section-title">Preflight Council</h2>
        <span className={`review-council-count ${flagged === 0 ? "clear" : "flagged"}`}>{headline}</span>
      </header>
      {decisionDisagrees && (
        <p className="review-council-note">
          <ShieldQuestion size={13} /> The live policy decision ({decision?.label}) differs from this
          council snapshot — refresh after the run settles.
        </p>
      )}
      <div className="reviewer-list">
        {ordered.map((reviewer) => {
          const hasDetail = reviewer.evidence.length > 0 || Boolean(reviewer.next_step);
          const row = (
            <div className={`reviewer-row ${reviewer.status}`}>
              <Sprite name={reviewer.sprite} aria-hidden="true" />
              <span>
                <strong>{reviewer.name}</strong>
                <small>{reviewer.summary}</small>
              </span>
              <span className={`pill ${reviewer.status === "pass" ? "ready" : reviewer.status === "warn" ? "warn" : "planned"}`}>
                {reviewer.label}
              </span>
            </div>
          );
          if (!hasDetail) {
            return <React.Fragment key={reviewer.key}>{row}</React.Fragment>;
          }
          return (
            <details className="reviewer-details" key={reviewer.key}>
              <summary>{row}</summary>
              <div className="reviewer-detail-body">
                {reviewer.evidence.length > 0 && (
                  <ul className="reviewer-evidence">
                    {reviewer.evidence.map((item, index) => (
                      <li key={`${reviewer.key}-ev-${index}`}>{item}</li>
                    ))}
                  </ul>
                )}
                {reviewer.next_step && (
                  <p className="reviewer-next-step">
                    <Wrench size={13} /> <strong>Next:</strong> {reviewer.next_step}
                  </p>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

export default ReviewCouncil;
