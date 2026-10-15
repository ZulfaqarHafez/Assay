"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

/** Copies exact text to the clipboard and confirms for a moment. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  return (
    <button
      type="button"
      className={`copy-button ${copied ? "copied" : ""}`}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      onClick={() => {
        if (typeof navigator === "undefined" || !navigator.clipboard) return;
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setCopied(false), 1600);
        });
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

export default CopyButton;
