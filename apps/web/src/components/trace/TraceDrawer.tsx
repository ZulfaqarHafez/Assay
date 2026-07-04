"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Sprite from "@/components/ui/Sprite";
import { assayApi } from "@/lib/api";
import { downloadJson, labelize, maxTransferGap, traceScoreLabel } from "@/lib/derive";
import type {
  AgentSpec,
  ProofBundle,
  RunEvent,
  Scorecard,
  TracePayload
} from "@/types/assay";
import SpanTree from "./SpanTree";
import SpanDetail from "./SpanDetail";

export type TraceDrawerProps = {
  events: RunEvent[];
  trace: TracePayload | null;
  scorecard: Scorecard | null;
  proofBundle: ProofBundle | null;
  agentSpec: AgentSpec | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function readinessVariant(readiness: AgentSpec["readiness"]): "pass" | "warn" | "neutral" {
  if (readiness === "ready") return "pass";
  if (readiness === "needs_subagents") return "warn";
  return "neutral";
}

export function TraceDrawer({
  events,
  trace,
  scorecard,
  proofBundle,
  agentSpec,
  open,
  onOpenChange
}: TraceDrawerProps) {
  const spanEvents = React.useMemo(
    () => (events.length ? events : trace?.events ?? []),
    [events, trace]
  );

  const [selectedSpanId, setSelectedSpanId] = React.useState<string | null>(null);
  const [showAnnotations, setShowAnnotations] = React.useState(false);
  const [downloadingProof, setDownloadingProof] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (selectedSpanId && spanEvents.some((event) => event.span_id === selectedSpanId)) {
      return;
    }
    const graded = spanEvents.find((event) => event.event_type === "response_graded");
    setSelectedSpanId((graded ?? spanEvents[0])?.span_id ?? null);
  }, [open, spanEvents, selectedSpanId]);

  const selectedSpan = React.useMemo(
    () => spanEvents.find((event) => event.span_id === selectedSpanId) ?? null,
    [spanEvents, selectedSpanId]
  );

  const runId = trace?.run_id ?? proofBundle?.run.id ?? scorecard?.run_id ?? null;
  const audit = scorecard?.trace_audit;

  const handleDownload = async () => {
    if (!runId) return;
    setDownloadingProof(true);
    try {
      const fullBundle = await assayApi.proofBundle(runId, "full");
      downloadJson(`assay-${runId}-proof-bundle.json`, fullBundle);
    } finally {
      setDownloadingProof(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--color-overlay)",
            zIndex: 60
          }}
        />
        <Dialog.Content
          aria-label="Trace inspector"
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "min(960px, 100vw)",
            background: "var(--color-bg)",
            color: "var(--color-fg)",
            borderLeft: "1px solid var(--color-border)",
            boxShadow: "var(--shadow-card)",
            zIndex: 61,
            display: "grid",
            gridTemplateRows: "auto auto 1fr",
            minHeight: 0
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement)?.focus();
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "14px 16px",
              borderBottom: "1px solid var(--color-border)"
            }}
          >
            <div style={{ display: "grid", gap: 2 }}>
              <Dialog.Title style={{ margin: 0, fontSize: 15 }}>Trace inspector</Dialog.Title>
              <Dialog.Description style={{ margin: 0, fontSize: 12, color: "var(--color-fg-muted)" }}>
                {runId ? `Run ${runId}` : "No run selected"}
              </Dialog.Description>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Button
                variant="icon"
                aria-label="Download proof bundle"
                title="Download proof bundle"
                onClick={() => void handleDownload()}
                disabled={!runId || downloadingProof}
              >
                <Download size={18} />
              </Button>
              <Dialog.Close asChild>
                <Button variant="icon" aria-label="Close trace inspector" title="Close">
                  <X size={18} />
                </Button>
              </Dialog.Close>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              padding: "10px 16px",
              borderBottom: "1px solid var(--color-border)",
              background: "var(--color-surface)"
            }}
          >
            <SummaryItem label="TraceRazor" value={traceScoreLabel(scorecard)} hint={audit?.grade ?? undefined} />
            <SummaryItem
              label="Transfer gap"
              value={scorecard ? maxTransferGap(scorecard).toFixed(2) : "-"}
            />
            <SummaryItem label="Spans" value={String(spanEvents.length)} />
            <SummaryItem
              label="Certificate"
              value={scorecard ? (scorecard.certified ? "Passed" : "Needs review") : "-"}
            />
            {agentSpec && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                <Sprite name="lesson-applied" sheet="lessons" />
                <Badge variant={readinessVariant(agentSpec.readiness)}>
                  Coaching: {labelize(agentSpec.readiness)}
                </Badge>
              </span>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(240px, 320px) 1fr",
              minHeight: 0
            }}
          >
            <div
              style={{
                borderRight: "1px solid var(--color-border)",
                minHeight: 0,
                overflow: "hidden",
                background: "var(--color-panel)"
              }}
            >
              <SpanTree
                events={spanEvents}
                selectedSpanId={selectedSpanId}
                onSelect={(span) => setSelectedSpanId(span.span_id)}
                showAnnotations={showAnnotations}
                onToggleAnnotations={setShowAnnotations}
              />
            </div>
            <div style={{ minHeight: 0, overflow: "hidden", background: "var(--color-bg)" }}>
              <SpanDetail span={selectedSpan} />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SummaryItem({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <span style={{ fontSize: 11, color: "var(--color-fg-muted)" }}>{label}</span>
      <strong style={{ fontSize: 14 }}>
        {value}
        {hint ? <span style={{ fontWeight: 400, color: "var(--color-fg-muted)" }}> {hint}</span> : null}
      </strong>
    </div>
  );
}

export default TraceDrawer;
