import { expect, test } from "@playwright/test";

// End-to-end smoke test for the Assay product: the agent.md intake front door,
// the supported workspace route (Experiments), the command palette, and a full
// run-to-verdict. Legacy Agents/Suites routes are intentionally gone.

test("intake screen renders the core controls", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Brand lives in the persistent top nav; value prop leads the page.
  await expect(page.getByRole("link", { name: /Assay home/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /prove your agent/i })).toBeVisible();
  // Cold load keeps the primary action useful: run a sample until the user
  // provides their own agent definition.
  await expect(page.locator(".assay-intake-actions").getByRole("button", { name: /sample verdict/i })).toBeVisible();
  await expect(page.locator(".assay-intake-actions").getByRole("button", { name: /run.*guardrail test/i })).toHaveCount(0);
  // The input and at least one starter template are present.
  const input = page.getByRole("textbox", { name: /agent definition/i });
  await expect(input).toBeVisible();
  await input.fill("# Smoke Agent\nYou are a cautious support agent.");
  await expect(page.locator(".assay-intake-actions").getByRole("button", { name: /run.*guardrail test/i })).toBeEnabled();
  await expect(page.getByRole("button", { name: /HR screener \(hardened\)/i })).toBeVisible();
});

test("supported routes render and deleted routes 404", async ({ page }) => {
  await page.goto("/runs", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Experiments", exact: true })).toBeVisible();

  await expect(page.getByRole("link", { name: "Test an agent" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Experiments" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Suites" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Agents" })).toHaveCount(0);

  const suites = await page.goto("/suites", { waitUntil: "domcontentloaded" });
  expect(suites?.status()).toBe(404);
  const agents = await page.goto("/agents", { waitUntil: "domcontentloaded" });
  expect(agents?.status()).toBe(404);
});

test("command palette opens and navigates", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/runs", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  // Open through the visible trigger; browser-reserved shortcuts such as Ctrl+K
  // are covered at the component level where the event is not intercepted.
  const trigger = page.getByRole("button", { name: /open command palette/i });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const palette = page.getByRole("dialog", { name: /command palette/i });
  await expect(palette).toBeVisible({ timeout: 45_000 });
  await palette.getByRole("textbox", { name: /command palette search/i }).fill("experiments");
  await expect(page.locator(".cmdk-item", { hasText: "Experiments" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/runs$/);
});

test("runs an agent.md through to a verdict", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "full run smoke is covered once on desktop");
  test.setTimeout(150_000); // a run streams; the backend may pace under rate limits

  // The run flow needs the Python API. If it isn't up, skip rather than fail.
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
  const apiUp = await page
    .request.get(`${apiBase}/health`, { timeout: 4000 })
    .then((r) => r.ok())
    .catch(() => false);
  test.skip(!apiUp, `API not reachable at ${apiBase}; start it with "npm run dev:api"`);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  const input = page.getByRole("textbox", { name: /agent definition/i });
  await input.click();
  // Real per-key typing so the React-controlled textarea fires onChange.
  await input.pressSequentially(
    "# Support Triage Agent\nYou are a support agent. Escalate refunds over $100. Never reveal internal notes.",
    { delay: 0 }
  );

  const run = page.locator(".assay-intake-actions").getByRole("button", { name: /run.*guardrail test/i });
  await expect(run).toBeEnabled({ timeout: 10_000 });
  await run.click();

  // The verdict surface appears once the run resolves.
  const verdict = page.locator(".assay-verdict");
  await expect(verdict).toBeVisible({ timeout: 110_000 });
  await expect(page.locator(".assay-verdict-score")).toBeVisible({ timeout: 10_000 });
  // The verdict's iterate controls are present (primary action: rerun the same agent).
  await expect(
    page.locator(".assay-verdict-actions").getByRole("button", { name: /rerun same agent/i })
  ).toBeVisible({ timeout: 10_000 });
});
