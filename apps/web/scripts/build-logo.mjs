// Canonical generator for the Assay mark: the "Specimen A":
//   a bespoke high-contrast serif A (drawn, not typed, with a hairline left stroke
//   against a weighted right, fine bracketed serifs, a sharp apex), with the
//   specimen worn beside it as a discreet maker's mark: a jewel (the sample) and
//   a smaller gold point (its reading). Deep navy and antique gold: the register
//   of a private-equity house crossed with a hallmark of certified purity.
//
// Produces, from one vector source (crisp at every size, correct on light + dark):
//   public/brand/assay-mark.png        bare light mark, transparent (source of truth)
//   public/brand/assay-icon.png        ivory rounded tile + ink mark   (nav on light)
//   public/brand/assay-icon-dark.png   navy  rounded tile + gilded mark (dark surfaces)
//   src/app/icon.png                   navy tile (Next.js favicon, reads at 16px in a tab;
//                                       an ivory tile with a thin navy A greyed out to a blob)
//   src/app/apple-icon.png             navy tile (iOS home-screen / apple-touch-icon)
//
// Does NOT touch assay-og.png. Run: node scripts/build-logo.mjs
import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const brand = join(here, '..', 'public', 'brand');
const appDir = join(here, '..', 'src', 'app');

// palette
const BONE = '#f4ead6';       // ivory tile
const INK = '#0a2342';        // deep navy, the A on ivory
const JEWEL = '#5a1a4f';      // aubergine specimen
const GOLD = '#9c7a35';       // antique gold reading
const NAVY = '#0a2342';       // dark tile ground
const IVORY_A = '#f0e7d4';    // the A on navy
const ORCHID = '#b06ba0';     // specimen on navy
const GOLD_LT = '#cba75c';    // gold on navy

const dot = (x, y, r, f) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}"/>`;
// bespoke high-contrast serif A + the maker's-mark specimen (jewel + gold)
function specimenA(line, jewel, gold) {
  return (
    `<path d="M256,100 L250,138 L180,396 L158,396 Z" fill="${line}"/>` +   // hairline left stroke
    `<path d="M256,100 L262,132 L338,396 L384,396 Z" fill="${line}"/>` +   // weighted right stroke
    `<rect x="206" y="293" width="104" height="15" fill="${line}"/>` +      // crossbar
    `<rect x="128" y="389" width="80" height="11" rx="2" fill="${line}"/>` +// left foot serif
    `<rect x="322" y="389" width="80" height="11" rx="2" fill="${line}"/>` +// right foot serif
    dot(302, 152, 13, jewel) + dot(340, 152, 10, gold)                      // maker's mark
  );
}
function svg(line, jewel, gold, tile) {
  const bg = tile ? `<rect x="0" y="0" width="512" height="512" rx="112" fill="${tile}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${bg}${specimenA(line, jewel, gold)}</svg>`;
}

const targets = [
  { file: join(brand, 'assay-mark.png'),      svg: svg(INK, JEWEL, GOLD, null),          size: 1024 },
  { file: join(brand, 'assay-icon.png'),      svg: svg(INK, JEWEL, GOLD, BONE),          size: 512 },
  { file: join(brand, 'assay-icon-dark.png'), svg: svg(IVORY_A, ORCHID, GOLD_LT, NAVY),  size: 512 },
  // The tab favicon and apple-touch icon use the NAVY tile: a light glyph on a
  // dark ground stays legible at 16px, where the ivory tile washed out.
  { file: join(appDir, 'icon.png'),           svg: svg(IVORY_A, ORCHID, GOLD_LT, NAVY),  size: 512 },
  { file: join(appDir, 'apple-icon.png'),     svg: svg(IVORY_A, ORCHID, GOLD_LT, NAVY),  size: 512 },
];

const browser = await chromium.launch();
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
  const scaled = t.svg.replace('width="512" height="512"', `width="${t.size}" height="${t.size}"`);
  await page.setContent(`<body style="margin:0;background:transparent">${scaled}</body>`);
  writeFileSync(t.file, await (await page.$('svg')).screenshot({ omitBackground: true }));
  await page.close();
  console.log('wrote', t.file);
}
await browser.close();
