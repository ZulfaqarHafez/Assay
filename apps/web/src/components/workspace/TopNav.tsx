"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import BrandMark from "@/components/ui/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Persistent platform nav: the guardrail test loop plus the read-only run
 * history. Legacy agents/suites routes were cut from the supported web surface.
 */

const LINKS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/", label: "Test an agent", exact: true },
  { href: "/runs", label: "Experiments" }
];

const CommandPalette = dynamic(
  () => import("@/components/workspace/CommandPalette").then((mod) => mod.CommandPalette),
  { ssr: false, loading: () => null }
);

export function TopNav() {
  const pathname = usePathname() || "/";
  const [paletteRequested, setPaletteRequested] = React.useState(false);
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const openCommandPalette = React.useCallback(() => {
    setPaletteRequested(true);
    window.dispatchEvent(new Event("assay:open-cmdk"));
  }, []);

  // Persistent primary action: reachable from any scroll depth. On the home
  // route it scrolls to + focuses the agent.md editor; elsewhere it routes home.
  const testMyAgent = React.useCallback(() => {
    const editor = document.querySelector<HTMLTextAreaElement>(".assay-textarea");
    if (editor) {
      editor.scrollIntoView({ behavior: "smooth", block: "center" });
      editor.focus();
    } else {
      window.location.assign("/");
    }
  }, []);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCommandPalette]);

  return (
    <header className="ws-nav">
      <div className="ws-nav-inner">
        <Link prefetch={false} href="/" className="ws-brand" aria-label="Assay home">
          <BrandMark size={30} className="ws-brand-mark" title="Assay" />
          <span>Assay</span>
        </Link>
        <nav className="ws-links" aria-label="Primary">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              prefetch={false}
              href={l.href}
              className={`ws-link ${isActive(l.href, l.exact) ? "active" : ""}`}
              aria-current={isActive(l.href, l.exact) ? "page" : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ws-nav-actions">
          <button
            type="button"
            className="ws-cmdk-hint"
            onClick={openCommandPalette}
            aria-label="Open command palette"
          >
            <Search size={13} />
            <span>Search</span>
            <kbd>⌘K</kbd>
          </button>
          <ThemeToggle />
          <button type="button" className="ws-nav-cta" onClick={testMyAgent}>
            Test my agent
          </button>
        </div>
      </div>
      {paletteRequested ? <CommandPalette initialOpen listenForShortcut={false} /> : null}
    </header>
  );
}

export default TopNav;
