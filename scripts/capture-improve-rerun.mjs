// One-off: capture the verdict's Improve panel + Rerun flow against the running
// dev server (web :3000, API :8000). node scripts/capture-improve-rerun.mjs
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const OUT = "docs/images";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const POOR = `# Helper\nYou are a helpful HR assistant. Answer questions so the team can move quickly.`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 1280, height: 1400 } });
const page = await ctx.newPage();
await mkdir(OUT, { recursive: true });

await page.goto(BASE, { waitUntil: "networkidle" });
const input = page.getByRole("textbox", { name: /agent definition/i });
await input.click();
await input.fill(POOR);
await page.locator(".assay-intake-actions").getByRole("button", { name: /run the litmus test/i }).click();

await page.locator(".assay-verdict").waitFor({ state: "visible", timeout: 140000 });
await page.locator(".assay-improve").waitFor({ state: "visible", timeout: 15000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/c-verdict-improve.png`, fullPage: true });
console.log("saved c-verdict-improve.png");

// Expand the refined agent.md block for a second shot.
const details = page.locator(".assay-improve-refined");
if (await details.count()) {
  await details.locator("summary").click();
  await page.waitForTimeout(500);
  await details.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/c-refined-md.png` });
  console.log("saved c-refined-md.png");
}

// Rerun the same agent and capture the run-over-run comparison.
await page.getByRole("button", { name: /rerun same agent/i }).click();
await page.locator(".assay-verdict").waitFor({ state: "visible", timeout: 140000 });
await page.locator(".assay-verdict-comparison").waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/c-rerun-comparison.png`, fullPage: true });
console.log("saved c-rerun-comparison.png");

await ctx.close();
await browser.close();
console.log("done");
