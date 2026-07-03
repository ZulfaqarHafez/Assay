import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewportDeferred } from "./ViewportDeferred";

describe("ViewportDeferred", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps children deferred until the section is near the viewport", async () => {
    let callback: IntersectionObserverCallback | null = null;
    const observe = vi.fn();
    const disconnect = vi.fn();

    class TestIntersectionObserver {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb;
      }

      observe = observe;
      disconnect = disconnect;
    }

    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);

    render(
      <ViewportDeferred fallback={<div>Loading island</div>}>
        <div>Heavy island</div>
      </ViewportDeferred>
    );

    expect(screen.getByText("Loading island")).toBeInTheDocument();
    expect(screen.queryByText("Heavy island")).not.toBeInTheDocument();
    await waitFor(() => expect(observe).toHaveBeenCalledTimes(1));

    act(() => {
      callback?.(
        [{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(screen.getByText("Heavy island")).toBeInTheDocument();
    expect(disconnect).toHaveBeenCalled();
  });

  it("renders children on the fallback path when IntersectionObserver is unavailable", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("IntersectionObserver", undefined);

    render(
      <ViewportDeferred fallback={<div>Loading island</div>}>
        <div>Heavy island</div>
      </ViewportDeferred>
    );

    expect(screen.getByText("Loading island")).toBeInTheDocument();

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(screen.getByText("Heavy island")).toBeInTheDocument();
  });
});
