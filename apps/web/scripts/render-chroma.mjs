// Headlessly renders the seeded "Chromatographic Ascension" p5 sketch to a
// transparent PNG -> public/brand/hero-chroma.png.
import { chromium } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, "chroma", "chroma.html");
const out = join(here, "..", "public", "brand", "hero-chroma.png");

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 }).then((c) => c.newPage());
await page.goto("file://" + htmlPath.replace(/\\/g, "/"));
const dataUrl = await page.waitForFunction(() => window.__chromaDone, null, { timeout: 30000 }).then((h) => h.jsonValue());
const b64 = dataUrl.split(",")[1];
writeFileSync(out, Buffer.from(b64, "base64"));
await browser.close();
console.log("wrote", out, "bytes", Buffer.from(b64, "base64").length);
