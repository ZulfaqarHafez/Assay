import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopNav } from "./TopNav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/runs"
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  )
}));

vi.mock("@/components/ui/BrandMark", () => ({
  default: () => <span aria-hidden="true" />
}));

vi.mock("@/components/ThemeToggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>
}));

vi.mock("@/components/workspace/CommandPalette", () => ({
  CommandPalette: () => null
}));

describe("TopNav", () => {
  it("keeps primary navigation from prefetching route payloads on initial paint", () => {
    render(<TopNav />);

    expect(screen.getByLabelText("Assay home")).toHaveAttribute("data-prefetch", "false");
    for (const label of ["Test an agent", "Experiments", "Suites", "Agents"]) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("data-prefetch", "false");
    }
  });
});
