"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiBaseUrl, assayApi } from "@/lib/api";
import type { RunEvent, Scorecard } from "@/types/assay";

/**
 * Lifecycle of a long-running evaluation, modeled as an explicit state machine:
 *
 *   idle → queued → running → completed
 *                            ↘ failed
 *                            ↘ canceled
 *
 * `idle` is the pre-start resting state; the other four mirror the backend run
 * lifecycle the plan calls for.
 */
export type RunStreamStatus = "idle" | "queued" | "running" | "completed" | "failed" | "canceled";

export type RunStreamState = {
  status: RunStreamStatus;
  /** 0..1 determinate progress from graded probes / expected probes. */
  progress: number;
  /** Number of `response_graded` events seen so far. */
  gradedCount: number;
  /** Expected total graded probes (`items.length * k * 2 variants`); 0 when unknown. */
  totalExpected: number;
  /** Live event stream as it arrives from polling. */
  events: RunEvent[];
  /** The final scorecard once the run resolves, otherwise null. */
  scorecard: Scorecard | null;
  /** Populated when `status === "failed"`. */
  error: string | null;
  /** True between start and resolution. */
  isActive: boolean;
};

export type StartRunOptions = {
  /** Trials per item, used to size the determinate progress bar. */
  k?: number;
  /** Number of exam items; each item has seen and held-out probes. */
  itemCount?: number;
};

export type RunStreamControls = {
  /** Begin a run: POST start, then poll events until it resolves. */
  start: (runId: string, options?: StartRunOptions) => void;
  /** Abort the in-flight start request and stop polling. */
  cancel: () => void;
  /** Return to `idle` and clear the previous run's state. */
  reset: () => void;
};

export type UseRunStream = RunStreamState & RunStreamControls;

/**
 * Pluggable event source. The default polls `GET /runs/{id}/events`, but a
 * future SSE source can implement the same contract so callers never change:
 * `subscribe` pushes each fresh event snapshot and returns an unsubscribe fn.
 */
export type RunEventSource = {
  subscribe: (
    runId: string,
    onEvents: (events: RunEvent[]) => void,
    signal: AbortSignal
  ) => () => void;
};

const DEFAULT_POLL_MS = 1000;

function pathSegment(value: string) {
  return encodeURIComponent(value);
}

/**
 * Start a run with an abortable request. Mirrors `assayApi.startRun` but
 * threads an `AbortSignal` so `cancel()` aborts the in-flight POST - the shared
 * client intentionally stays signal-free.
 */
async function startRunWithSignal(runId: string, signal: AbortSignal): Promise<Scorecard> {
  const response = await fetch(`${apiBaseUrl()}/runs/${pathSegment(runId)}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return response.json() as Promise<Scorecard>;
}

/**
 * A live run executes every exam turn inside the single `/start` request, which
 * can run for minutes. Some networks drop such long-lived connections, but the
 * run keeps going server-side and persists its result. When the `/start` fetch
 * fails for that reason, recover by polling the run until it settles, so a
 * completed run is never lost to a dropped connection.
 */
// A live run fires k × items × 2 OpenAI calls inside one /start request; on a
// free-tier ~3 RPM key a 10-item pack is ~20 min. The old 3-min cap declared
// such runs "failed" while the orchestrator was still completing them - so the
// recovery poller now waits up to 20 min for the run to actually settle.
const RECOVERY_MAX_MS = 20 * 60_000;

async function recoverRunResult(runId: string, signal: AbortSignal): Promise<Scorecard | "failed" | null> {
  const deadline = Date.now() + RECOVERY_MAX_MS;
  while (Date.now() < deadline && !signal.aborted) {
    try {
      const runResponse = await fetch(`${apiBaseUrl()}/runs/${pathSegment(runId)}`, { signal });
      if (runResponse.ok) {
        const record = (await runResponse.json()) as { status?: string };
        if (record.status === "completed") {
          const scoreResponse = await fetch(`${apiBaseUrl()}/runs/${pathSegment(runId)}/scorecard`, { signal });
          if (scoreResponse.ok) return (await scoreResponse.json()) as Scorecard;
        } else if (record.status === "failed") {
          return "failed";
        }
      }
    } catch {
      // Keep polling; the run may still be in flight.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

function eventSequence(event: RunEvent): number {
  return Number.isFinite(event.sequence) ? event.sequence : 0;
}

function mergeEventSnapshot(current: RunEvent[], incoming: RunEvent[]): RunEvent[] {
  if (incoming.length === 0) return current;
  const byKey = new Map<string, RunEvent>();
  for (const event of current) {
    byKey.set(`${event.sequence}:${event.span_id}`, event);
  }
  for (const event of incoming) {
    byKey.set(`${event.sequence}:${event.span_id}`, event);
  }
  return [...byKey.values()].sort((a, b) => eventSequence(a) - eventSequence(b));
}

/** Default poll-based event source. Swap for an SSE source without touching callers. */
export function createPollSource(intervalMs = DEFAULT_POLL_MS): RunEventSource {
  return {
    subscribe(runId, onEvents, signal) {
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let snapshot: RunEvent[] = [];
      let afterSequence: number | undefined;

      const tick = async () => {
        if (stopped || signal.aborted) return;
        try {
          const events = await assayApi.events(runId, afterSequence);
          if (!stopped && !signal.aborted && events.length > 0) {
            snapshot = mergeEventSnapshot(snapshot, events);
            afterSequence = Math.max(...snapshot.map(eventSequence));
            onEvents(snapshot);
          }
        } catch {
          // Transient poll error: keep the loop alive, the run may still finish.
        }
        if (!stopped && !signal.aborted) {
          timer = setTimeout(() => void tick(), intervalMs);
        }
      };

      void tick();

      return () => {
        stopped = true;
        if (timer) clearTimeout(timer);
      };
    }
  };
}

function countGraded(events: RunEvent[]): number {
  return events.filter((event) => event.event_type === "response_graded").length;
}

const INITIAL: RunStreamState = {
  status: "idle",
  progress: 0,
  gradedCount: 0,
  totalExpected: 0,
  events: [],
  scorecard: null,
  error: null,
  isActive: false
};

/**
 * Drives a long-running run as a state machine and exposes determinate progress.
 *
 * After `start(runId)` it POSTs `/runs/{id}/start` (abortable via `cancel()`)
 * and concurrently polls `/runs/{id}/events` ~1s to update determinate progress
 * = gradedCount / (itemCount * k * 2 variants). When the start request resolves it captures
 * the scorecard and transitions to `completed`; rejection → `failed`; an abort →
 * `canceled`. The event source is injectable so an SSE implementation can drop in
 * later without changing this hook's public surface.
 */
export function useRunStream(source?: RunEventSource): UseRunStream {
  const [state, setState] = useState<RunStreamState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const totalExpectedRef = useRef(0);
  const mountedRef = useRef(true);

  // A stable source for the lifetime of the hook; defaults to polling.
  const eventSource = useMemo(() => source ?? createPollSource(), [source]);

  const teardown = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    abortRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const applyEvents = useCallback((events: RunEvent[]) => {
    if (!mountedRef.current) return;
    const gradedCount = countGraded(events);
    const totalExpected = totalExpectedRef.current;
    const progress = totalExpected > 0 ? Math.min(1, gradedCount / totalExpected) : 0;
    setState((prev) => {
      // Once resolved, keep the terminal status but still let late events land.
      const status: RunStreamStatus =
        prev.status === "queued" && events.length > 0 ? "running" : prev.status;
      return { ...prev, status, events, gradedCount, progress };
    });
  }, []);

  const start = useCallback(
    (runId: string, options?: StartRunOptions) => {
      // Cancel any prior in-flight run before starting a new one.
      unsubscribeRef.current?.();
      abortRef.current?.abort();

      const totalExpected = Math.max(0, (options?.itemCount ?? 0) * (options?.k ?? 0) * 2);
      totalExpectedRef.current = totalExpected;

      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        ...INITIAL,
        status: "queued",
        totalExpected,
        isActive: true
      });

      unsubscribeRef.current = eventSource.subscribe(runId, applyEvents, controller.signal);

      startRunWithSignal(runId, controller.signal)
        .then((scorecard) => {
          if (!mountedRef.current || controller.signal.aborted) return;
          teardown();
          setState((prev) => ({
            ...prev,
            status: "completed",
            scorecard,
            progress: prev.totalExpected > 0 ? Math.max(prev.progress, 1) : prev.progress,
            isActive: false
          }));
        })
        .catch(async (exc: unknown) => {
          if (!mountedRef.current) return;
          if (controller.signal.aborted) {
            // Aborts are surfaced through cancel(), not here.
            return;
          }
          // The /start connection dropped - but the run may still be completing
          // server-side. Try to recover its result before declaring failure.
          const recovered = await recoverRunResult(runId, controller.signal);
          if (!mountedRef.current || controller.signal.aborted) return;
          if (recovered && recovered !== "failed") {
            teardown();
            setState((prev) => ({
              ...prev,
              status: "completed",
              scorecard: recovered,
              progress: prev.totalExpected > 0 ? Math.max(prev.progress, 1) : prev.progress,
              isActive: false
            }));
            return;
          }
          teardown();
          setState((prev) => ({
            ...prev,
            status: "failed",
            error: recovered === "failed" ? "The run failed server-side." : exc instanceof Error ? exc.message : "Run failed",
            isActive: false
          }));
        });
    },
    [applyEvents, eventSource, teardown]
  );

  const cancel = useCallback(() => {
    if (!abortRef.current) return;
    abortRef.current.abort();
    teardown();
    setState((prev) =>
      prev.status === "queued" || prev.status === "running"
        ? { ...prev, status: "canceled", isActive: false }
        : prev
    );
  }, [teardown]);

  const reset = useCallback(() => {
    unsubscribeRef.current?.();
    abortRef.current?.abort();
    teardown();
    totalExpectedRef.current = 0;
    setState(INITIAL);
  }, [teardown]);

  return { ...state, start, cancel, reset };
}

export default useRunStream;
