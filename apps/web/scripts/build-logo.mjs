// Canonical generator for the Assay mark — the "A·i" specimen mark:
//   two ink strokes form an A; the right stroke doubles as an italic 'i' whose
//   tittle is a plum specimen dot; a plum flame-droplet (the sample being
//   assayed) nestles in the counter. "Assay" = to test a sample for purity —
//   here, the sample is your agent, and the hidden 'i' nods to testing AI.
//
// Produces, from one vector source (crisp at every size, correct light-on-dark
// for the ink tile — not a recolored background):
//   public/brand/assay-mark.png        bare light mark, transparent (source of truth)
//   public/brand/assay-icon.png        bone rounded tile + light mark  (nav / favicon)
//   public/brand/assay-icon-dark.png   ink  rounded tile + dark  mark  (dark surfaces)
//   src/app/icon.png                   bone tile (Next.js favicon)
//
// Does NOT touch assay-og.png (owned by the OG builder). Run: node scripts/build-logo.mjs
import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const brand = join(here, '..', 'public', 'brand');
const appDir = join(here, '..', 'src', 'app');

// palette
const INK = '#0a2342';   // deep navy strokes (light mark)
const PLUM = '#581a4f';  // aubergine specimen (light mark)
const BONE = '#f4ead6';  // warm paper tile
const TILE_INK = '#1c212e';   // dark tile
const BONE_STROKE = '#f2ead9'; // strokes on the dark tile
const MAUVE = '#b06ba0';       // specimen on the dark tile

// --- vector (512 viewBox) -------------------------------------------------
// Two bowed strokes with round caps flow like poured liquid; the right stroke +
// tittle read as an italic 'i'. Curves + round terminals = the "fluid" feel.
function legs(w, ink) {
  return `<path d="M 226 172 Q 180 276 150 380" fill="none" stroke="${ink}" stroke-width="${w}" stroke-linecap="round"/>
    <path d="M 286 172 Q 332 276 362 380" fill="none" stroke="${ink}" stroke-width="${w}" stroke-linecap="round"/>`;
}
function droplet(cx, tipY, bulbCy, r, fill) {
  const l = cx - r, rt = cx + r;
  return `<path d="M ${cx} ${tipY} C ${cx + 30} ${tipY + 28}, ${rt} ${bulbCy - 16}, ${rt} ${bulbCy}
    A ${r} ${r} 0 1 1 ${l} ${bulbCy} C ${l} ${bulbCy - 16}, ${cx - 30} ${tipY + 28}, ${cx} ${tipY} Z" fill="${fill}"/>`;
}
const dot = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;

// locked "F1" fluid geometry
function mark(ink, plum) {
  return legs(46, ink) + dot(300, 130, 15, plum) + droplet(250, 214, 272, 35, plum);
}
function svg(inner, { tile = null } = {}) {
  const bg = tile ? `<rect x="0" y="0" width="512" height="512" rx="112" fill="${tile}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${bg}${inner}</svg>`;
}

const targets = [
  { file: join(brand, 'assay-mark.png'),      svg: svg(mark(INK, PLUM)),                          size: 1024 },
  { file: join(brand, 'assay-icon.png'),      svg: svg(mark(INK, PLUM), { tile: BONE }),          size: 512 },
  { file: join(brand, 'assay-icon-dark.png'), svg: svg(mark(BONE_STROKE, MAUVE), { tile: TILE_INK }), size: 512 },
  { file: join(appDir, 'icon.png'),           svg: svg(mark(INK, PLUM), { tile: BONE }),          size: 512 },
];

const browser = await chromium.launch();
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
  const scaled = t.svg.replace('width="512" height="512"', `width="${t.size}" height="${t.size}"`);
  await page.setContent(`<body style="margin:0;background:transparent">${scaled}</body>`);
  const el = await page.$('svg');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(t.file, await el.screenshot({ omitBackground: true }));
  await page.close();
  console.log('wrote', t.file);
}
await browser.close();
