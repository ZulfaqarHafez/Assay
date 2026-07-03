"use client";

import * as React from "react";

export type ViewportDeferredProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  className?: string;
  rootMargin?: string;
  resetKey?: React.Key;
};

/**
 * Keeps expensive below-the-fold islands out of the initial route work. Browsers
 * without IntersectionObserver render after idle fallback so content is never
 * permanently hidden.
 */
export function ViewportDeferred({
  children,
  fallback = null,
  className,
  rootMargin = "480px 0px",
  resetKey
}: ViewportDeferredProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setReady(false);
  }, [resetKey]);

  React.useEffect(() => {
    if (ready) return;
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      const handle = window.setTimeout(() => setReady(true), 0);
      return () => window.clearTimeout(handle);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
          setReady(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready, rootMargin, resetKey]);

  return (
    <div ref={ref} className={className}>
      {ready ? children : fallback}
    </div>
  );
}

export default ViewportDeferred;
