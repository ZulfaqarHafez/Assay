// One-off: verify the persistent iterate loop (RunDetail rerun + agent home).
// Requires web :3000 + API :8000. node scripts/capture-agent-home.mjs
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const OUT = "docs/images";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const POOR = `# Helper\nYou are a helpful HR assistant. Answer questions so the team can move quickly.`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 1280, height: 1400 } });
const page = await ctx.newPage();
await mkdir(OUT, { recursive: true });
const log = (...a) => console.log(...a);

// 1) Run an agent to a verdict.
await page.goto(BASE, { waitUntil: "networkidle" });
const input = page.getByRole("textbox", { name: /agent definition/i });
await input.click();
await input.fill(POOR);
await page.locator(".assay-intake-actions").getByRole("button", { name: /run the litmus test/i }).click();
await page.locator(".assay-verdict").waitFor({ state: "visible", timeout: 140000 });
log("verdict reached");

// 2) Open the saved run detail — must show the Rerun controls + Improve panel.
await page.getByRole("link", { name: /open in workspace/i }).click();
await page.waitForURL(/\/runs\/.+/, { timeout: 30000 });
await page.getByRole("button", { name: /rerun same agent/i }).waitFor({ state: "visible", timeout: 30000 });
await page.locator(".assay-improve").waitFor({ state: "visible", timeout: 15000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/d-rundetail-rerun.png`, fullPage: true });
log("RunDetail has rerun controls + improve panel");

// 3) Per-agent home via the Agents list.
await page.goto(`${BASE}/agents`, { waitUntil: "networkidle" });
await page.locator("table.ws-table tbody tr td a").first().click();
await page.waitForURL(/\/agents\/.+/, { timeout: 30000 });
await page.getByRole("button", { name: /rerun same agent/i }).waitFor({ state: "visible", timeout: 30000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/d-agent-home.png`, fullPage: true });
log("agent home rendered with rerun controls");

// 4) Rerun from the agent home → should stream and route to a new run.
const agentUrl = page.url();
await page.getByRole("button", { name: /rerun same agent/i }).click();
await page.waitForURL((u) => /\/runs\/.+/.test(u.toString()), { timeout: 140000 });
log("rerun from agent home routed to:", page.url());
await page.locator(".assay-improve, .rd-verdict").first().waitFor({ state: "visible", timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/d-rerun-result.png`, fullPage: true });

await ctx.close();
await browser.close();
log("done");
