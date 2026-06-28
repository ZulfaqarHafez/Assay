"use client";

import * as React from "react";

/**
 * The Assay mark — a flask of separated chromatography bands, generated in Canva
 * and exported as a rounded tile (bone or ink). Rendered as an <img> so the real
 * brand asset is used verbatim rather than re-drawn. The tile is self-contained,
 * so it reads on both the warm light and dark surfaces.
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
