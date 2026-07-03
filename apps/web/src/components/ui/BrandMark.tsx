"use client";

import * as React from "react";

/**
 * The Assay mark — two ink strokes form an "A" whose right stroke doubles as an
 * italic "i" (a nod to testing AI), with a plum specimen droplet in the counter.
 * Generated as a rounded tile (bone or ink) by scripts/build-logo.mjs and
 * rendered as an <img> so the real brand asset is used verbatim rather than
 * re-drawn. The tile is self-contained, so it reads on both light and dark
 * surfaces.
 */

export type BrandMarkProps = {
  size?: number;
  /** "bone" tile (default) or "ink" tile for very dark contexts. */
  variant?: "bone" | "ink";
  className?: string;
  title?: string;
};

export function BrandMark({ size = 28, variant = "bone", className, title }: BrandMarkProps) {
  const src = variant === "ink" ? "/brand/assay-icon-dark.png" : "/brand/assay-icon.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={size}
      height={size}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      className={className}
      style={{ borderRadius: Math.round(size * 0.22), display: "block" }}
      draggable={false}
    />
  );
}

export default BrandMark;
