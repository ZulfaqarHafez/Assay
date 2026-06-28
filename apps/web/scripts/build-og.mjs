// Renders the on-brand Open Graph / social card to public/brand/assay-og.png.
// Run: node scripts/build-og.mjs   (from apps/web)
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "brand");
mkdirSync(outDir, { recursive: true });

const FLASK = "M25.5 9 V22.5 L12.5 49.5 A4.5 4.5 0 0 0 16 54 H48 A4.5 4.5 0 0 0 51.5 49.5 L38.5 22.5 V9 Z";
const DROP = "M32 1 C33.8 3.7 35.2 5.4 35.2 7.5 A3.2 3.2 0 1 1 28.8 7.5 C28.8 5.4 30.2 3.7 32 1 Z";

const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="litmus" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#F2A93B"/>
      <stop offset="0.5" stop-color="#2BD3C4"/>
      <stop offset="1" stop-color="#34D277"/>
    </linearGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0F4138"/>
      <stop offset="1" stop-color="#0A2C26"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#2BD3C4" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#2BD3C4" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="glass">
      <path d="${FLASK}"/>
    </clipPath>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="250" cy="120" r="320" fill="url(#glow)"/>
  <ellipse cx="980" cy="540" rx="360" ry="240" fill="#F2A93B" opacity="0.10"/>

  <!-- flask mark, scaled from the 64-unit grid -->
  <g transform="translate(150 175) scale(4.3)">
    <g clip-path="url(#glass)">
      <rect x="8" y="36.5" width="48" height="22" fill="url(#litmus)"/>
      <rect x="8" y="36.5" width="48" height="1.6" fill="#ffffff" opacity="0.4"/>
      <circle cx="24" cy="46" r="1.4" fill="#ffffff" opacity="0.55"/>
      <circle cx="31" cy="50" r="1" fill="#ffffff" opacity="0.45"/>
      <circle cx="38" cy="45" r="1.2" fill="#ffffff" opacity="0.5"/>
      <path d="M24 26 L17.5 41" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.22"/>
    </g>
    <path d="${FLASK}" stroke="#F4FBF7" stroke-width="2.6" stroke-linejoin="round" fill="none"/>
    <path d="M21.5 8 H42.5" stroke="#F4FBF7" stroke-width="2.6" stroke-linecap="round"/>
    <path d="${DROP}" fill="url(#litmus)"/>
  </g>

  <text x="470" y="210" font-family="'Space Grotesk','Segoe UI',Arial,sans-serif" font-size="120" font-weight="700" letter-spacing="-4" fill="#F4FBF7">Assay</text>
  <rect x="474" y="244" width="300" height="8" rx="4" fill="url(#litmus)"/>
  <text x="474" y="330" font-family="'Segoe UI',Arial,sans-serif" font-size="40" font-weight="600" fill="#CFE9E2">Bring your agent.md.</text>
  <text x="474" y="386" font-family="'Segoe UI',Arial,sans-serif" font-size="40" font-weight="600" fill="#CFE9E2">Find out where it breaks.</text>
  <text x="474" y="470" font-family="'Segoe UI',Arial,sans-serif" font-size="26" font-weight="500" fill="#7FB3A9" letter-spacing="1">PRE-DEPLOYMENT LITMUS TEST FOR AI AGENTS</text>
</svg>`;

writeFileSync(join(outDir, "assay-og.svg"), svg);
await sharp(Buffer.from(svg)).png().toFile(join(outDir, "assay-og.png"));
console.log("Wrote assay-og.png + assay-og.svg");
