// Renders the Assay Open Graph / social card (1200x630) to public/brand/assay-og.png
// and a copy to docs/images/hero-banner.png (the README hero). Heritage identity:
// the Specimen A monogram + a letterspaced ASSAY wordmark, deep navy and antique gold.
// Run: node scripts/build-og.mjs   (from apps/web)
import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, copyFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const ogPath = join(here, '..', 'public', 'brand', 'assay-og.png');
const heroPath = join(repo, 'docs', 'images', 'hero-banner.png');

const NAVY = '#0a2342', IVORY = '#f0e7d4', GOLD = '#cba75c', GOLD_D = '#9c7a35', ORCHID = '#b06ba0', MUTED = '#b7ad95';

const dot = (x, y, r, f) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}"/>`;
const monogram = `<svg viewBox="0 0 512 512" width="66" height="66" style="display:block">
  <path d="M256,100 L250,138 L180,396 L158,396 Z" fill="${IVORY}"/>
  <path d="M256,100 L262,132 L338,396 L384,396 Z" fill="${IVORY}"/>
  <rect x="206" y="293" width="104" height="15" fill="${IVORY}"/>
  <rect x="128" y="389" width="80" height="11" rx="2" fill="${IVORY}"/>
  <rect x="322" y="389" width="80" height="11" rx="2" fill="${IVORY}"/>
  ${dot(302,152,13,ORCHID)}${dot(340,152,10,GOLD)}
</svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  *{margin:0;box-sizing:border-box}
  #card{width:1200px;height:630px;background:${NAVY};position:relative;overflow:hidden;
    font-family:'Playfair Display',Georgia,serif;color:${IVORY};
    display:flex;flex-direction:column;justify-content:space-between;padding:64px 72px}
  #card::before{content:"";position:absolute;inset:26px;border:1px solid rgba(203,167,92,.45);border-radius:6px;pointer-events:none}
  .vig{position:absolute;inset:0;background:radial-gradient(120% 120% at 50% 40%,transparent 55%,rgba(0,0,0,.28));pointer-events:none}
  header{display:flex;align-items:flex-start;justify-content:space-between;position:relative;z-index:1}
  .lock{display:flex;align-items:center;gap:16px}
  .wm{font-weight:600;font-size:34px;letter-spacing:.30em}
  .eyebrow{font-family:'IBM Plex Mono',monospace;font-size:13px;letter-spacing:.26em;text-transform:uppercase;color:${GOLD};padding-top:20px}
  .hero{position:relative;z-index:1;margin-bottom:6px}
  h1{font-weight:600;font-size:86px;line-height:1.02;letter-spacing:-.005em}
  .chip{font-family:'IBM Plex Mono',monospace;font-size:60px;font-weight:500;color:${GOLD};border-bottom:2px solid rgba(203,167,92,.5);padding-bottom:2px}
  .sub{font-size:32px;font-weight:500;color:${MUTED};margin-top:24px}
  footer{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;
    font-family:'IBM Plex Mono',monospace;font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:${GOLD_D}}
  footer::before{content:"";position:absolute;top:-22px;left:0;right:0;height:1px;background:linear-gradient(90deg,${GOLD_D},transparent)}
  .foot-r{color:${MUTED}}
</style></head><body>
<div id="card">
  <div class="vig"></div>
  <header>
    <div class="lock">${monogram}<span class="wm">ASSAY</span></div>
    <div class="eyebrow">Pre-deployment assay · for AI agents</div>
  </header>
  <div class="hero">
    <h1>Bring your <span class="chip">agent.md</span>.</h1>
    <div class="sub">Find out where it breaks — before you ship.</div>
  </div>
  <footer>
    <span>The hallmark for AI agents</span>
    <span class="foot-r">Every run is evidence</span>
  </footer>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
await page.setContent(html);
try { await page.evaluate(() => document.fonts.ready); } catch {}
await page.waitForTimeout(700);
mkdirSync(dirname(heroPath), { recursive: true });
await (await page.$('#card')).screenshot({ path: ogPath });
copyFileSync(ogPath, heroPath);
await browser.close();
console.log('wrote', ogPath, '+', heroPath);
