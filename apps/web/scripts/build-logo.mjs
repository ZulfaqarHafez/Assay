// Canonical generator for the Assay mark — the "specimen spiral":
//   a tapered ribbon winds inward (heavy at the rim, thinning as it turns) and
//   settles on a single plum specimen at its eye. It reads like an abstract
//   frontier-lab symbol (Anthropic/DeepMind spirit): one idea — many trials
//   drawn inward to a single reading — in one warm accent. Pairs with the
//   "Assay" wordmark set in Sora.
//
// Produces, from one vector source (crisp at every size, correct light-on-dark):
//   public/brand/assay-mark.png        bare light mark, transparent (source of truth)
//   public/brand/assay-icon.png        bone rounded tile + light mark  (nav / favicon)
//   public/brand/assay-icon-dark.png   ink  rounded tile + dark  mark  (dark surfaces)
//   src/app/icon.png                   bone tile (Next.js favicon)
//
// Does NOT touch assay-og.png. Run: node scripts/build-logo.mjs
import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const brand = join(here, '..', 'public', 'brand');
const appDir = join(here, '..', 'src', 'app');

const INK = '#0a2342';        // deep navy ribbon (light mark)
const PLUM = '#581a4f';       // aubergine specimen (light mark)
const BONE = '#f4ead6';       // warm paper tile
const TILE_INK = '#1c212e';   // dark tile
const BONE_STROKE = '#f2ead9';// ribbon on the dark tile
const MAUVE = '#b06ba0';      // specimen on the dark tile
const rad = d => d * Math.PI / 180;

// tapered spiral ribbon (512 viewBox), tucked into the specimen eye
function spiral(ink, eye) {
  const C = 256, TURNS = 2.15, R0 = 172, R1 = 12, wOut = 36, wIn = 3.5, N = 240, th0 = rad(-88);
  const cen = [];
  for (let i = 0; i <= N; i++) { const t = i / N; const th = th0 + t * TURNS * 2 * Math.PI; const r = R0 + t * (R1 - R0); cen.push([C + r * Math.cos(th), C + r * Math.sin(th)]); }
  const outer = [], inner = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N; const w = (wOut + (wIn - wOut) * t) / 2;
    const a = cen[Math.max(0, i - 1)], b = cen[Math.min(N, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
    const nx = -ty, ny = tx;
    outer.push([cen[i][0] + nx * w, cen[i][1] + ny * w]);
    inner.push([cen[i][0] - nx * w, cen[i][1] - ny * w]);
  }
  let d = 'M ' + outer[0][0].toFixed(1) + ' ' + outer[0][1].toFixed(1);
  for (let i = 1; i <= N; i++) d += ' L ' + outer[i][0].toFixed(1) + ' ' + outer[i][1].toFixed(1);
  for (let i = N; i >= 0; i--) d += ' L ' + inner[i][0].toFixed(1) + ' ' + inner[i][1].toFixed(1);
  d += ` A ${wOut / 2} ${wOut / 2} 0 0 1 ${outer[0][0].toFixed(1)} ${outer[0][1].toFixed(1)} Z`;
  return `<path d="${d}" fill="${ink}"/><circle cx="${C}" cy="${C}" r="17" fill="${eye}"/>`;
}
function svg(ink, eye, tile) {
  const bg = tile ? `<rect x="0" y="0" width="512" height="512" rx="112" fill="${tile}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${bg}${spiral(ink, eye)}</svg>`;
}

const targets = [
  { file: join(brand, 'assay-mark.png'),      svg: svg(INK, PLUM, null),          size: 1024 },
  { file: join(brand, 'assay-icon.png'),      svg: svg(INK, PLUM, BONE),          size: 512 },
  { file: join(brand, 'assay-icon-dark.png'), svg: svg(BONE_STROKE, MAUVE, TILE_INK), size: 512 },
  { file: join(appDir, 'icon.png'),           svg: svg(INK, PLUM, BONE),          size: 512 },
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
