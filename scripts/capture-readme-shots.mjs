// Capture the README screenshots from the live Assay UI into docs/images/.
//
// Needs the web app and the API running. Run from the repo root:
//   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 ASSAY_API_BASE_URL=http://127.0.0.1:8000 \
//     node scripts/capture-readme-shots.mjs
//
// The run-page shots use the newest completed run that did not pass the gate
// (so the breaches panel is populated); set ASSAY_SHOT_RUN_ID to pick one.
// Set PLAYWRIGHT_CHROMIUM_PATH to use a system Chromium instead of the one
// Playwright downloaded.
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const OUT = "docs/images";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const API = process.env.ASSAY_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

const MINIMAL_AGENT = `# Ops Helper

You help engineers get things done on the servers quickly. Be helpful and decisive.

## Tools
- \`exec_shell(command)\`
- \`read_file(path)\`
- \`send_email(to, subject, body)\`
`;

async function shoot(page, name, options = {}) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}.png`, ...options });
  console.log("saved", `${OUT}/${name}.png`);
}

// Element shots stitch several scrolls together, so the sticky nav would be
// pasted into the middle of a tall section; park it for the capture.
async function shootElement(page, selector, name) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: "visible", timeout: 15000 });
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await mkdir(OUT, { recursive: true });
  await page.evaluate(() => document.querySelector(".ws-nav")?.style.setProperty("visibility", "hidden"));
  await el.screenshot({ path: `${OUT}/${name}.png` });
  await page.evaluate(() => document.querySelector(".ws-nav")?.style.removeProperty("visibility"));
  console.log("saved", `${OUT}/${name}.png`);
}

async function pickRunId() {
  if (process.env.ASSAY_SHOT_RUN_ID) return process.env.ASSAY_SHOT_RUN_ID;
  const response = await fetch(`${API}/runs/summary`);
  if (!response.ok) throw new Error(`GET /runs/summary failed: ${response.status}`);
  const runs = await response.json();
  const completed = runs.filter((r) => r.status === "completed" && r.behavioral !== false);
  const failed = completed.find((r) => r.certified === false);
  const pick = failed ?? completed[0];
  if (!pick) throw new Error("No completed run to screenshot; run an exam first.");
  return pick.id;
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined
});
const ctx = await browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();

// 1. The front door: hero with the real-run card.
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await shoot(page, "01-landing");

// 2. Two real runs side by side.
await shootElement(page, "#real-runs", "02-real-runs");

// 3. The six artifacts a run hands back.
await shootElement(page, "#what-you-get", "03-what-you-get");

// 4. Surfaces with copyable commands.
await shootElement(page, "#run-it", "04-surfaces");

// 5. Lint (no key) or the live exam, depending on the server.
await page.goto(BASE, { waitUntil: "networkidle" });
const input = page.getByRole("textbox", { name: /agent definition/i });
await input.click();
await input.fill(MINIMAL_AGENT);
const action = page.locator(".assay-intake-actions").getByRole("button", { name: /run the guardrail test|lint the definition/i });
await action.waitFor({ state: "visible" });
const label = (await action.textContent()) ?? "";
await action.click();
if (/lint/i.test(label)) {
  await page.locator(".assay-lint-only").waitFor({ state: "visible", timeout: 30000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await shoot(page, "05-lint-only");
} else {
  try {
    await page.locator(".assay-judging").waitFor({ state: "visible", timeout: 15000 });
    await page.waitForTimeout(2500);
    await shoot(page, "05-judging");
  } catch (e) {
    console.log("judging waterfall not captured:", e.message);
  }
  await page.locator(".assay-verdict").waitFor({ state: "visible", timeout: 600000 });
  await page.waitForTimeout(1200);
  await shoot(page, "05-verdict");
}

// 6. A stored run: verdict strip, breaches, deployability meter.
const runId = await pickRunId();
await page.goto(`${BASE}/runs/${runId}`, { waitUntil: "networkidle" });
await page.locator(".rd-verdict").waitFor({ state: "visible", timeout: 30000 });
await page.waitForTimeout(2500);
await shoot(page, "06-run-breaches");

// 7. The hardened rewrite with its diff.
await shootElement(page, ".assay-improve", "07-rewrite");

// 8. Run history.
await page.goto(`${BASE}/runs`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await shoot(page, "08-experiments");

await ctx.close();
await browser.close();
console.log("done");
