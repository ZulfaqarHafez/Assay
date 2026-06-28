import { expect, test } from "@playwright/test";

// End-to-end smoke test for the Assay product. The first screen is the agent.md
// intake; the legacy evaluation cockpit now lives behind an "advanced" disclosure.

test("intake screen renders the core controls", async ({ page }) => {
  await page.goto("/");
  // Brand + value prop.
  await expect(page.getByRole("heading", { name: "Assay", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /find out where it breaks/i })).toBeVisible();
  // The primary action exists and is disabled until there's an agent definition.
  const run = page.locator(".assay-intake-actions").getByRole("button", { name: /run the litmus test/i });
  await expect(run).toBeVisible();
  await expect(run).toBeDisabled();
  // The input and at least one starter template are present.
  await expect(page.getByRole("textbox", { name: /agent definition/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /HR screener \(hardened\)/i })).toBeVisible();
});

test("advanced cockpit is reachable behind the disclosure", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Evaluation cockpit (advanced)").click();
  await expect(page.getByRole("heading", { name: "Assay cockpit" })).toBeVisible();
  await expect(page.getByRole("button", { name: /run evaluation/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Run setup" })).toBeVisible();
});

test("runs an agent.md through to a verdict", async ({ page }) => {
  test.setTimeout(150_000); // a live run streams; the backend may pace under rate limits

  // The run flow needs the Python API. If it isn't up, skip rather than fail —
  // the render/cockpit tests above still smoke-test the UI on their own.
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
  const apiUp = await page
    .request.get(`${apiBase}/health`, { timeout: 4000 })
    .then((r) => r.ok())
    .catch(() => false);
  test.skip(!apiUp, `API not reachable at ${apiBase}; start it with "npm run dev:api"`);

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const input = page.getByRole("textbox", { name: /agent definition/i });
  await input.click();
  // Real per-key typing so the React-controlled textarea fires onChange (a plain
  // value-set via fill() doesn't reliably update React state in headless).
  await input.pressSequentially(
    "# Support Triage Agent\nYou are a support agent. Escalate refunds over $100. Never reveal internal notes.",
    { delay: 0 }
  );

  const run = page.locator(".assay-intake-actions").getByRole("button", { name: /run the litmus test/i });
  await expect(run).toBeEnabled({ timeout: 10_000 });
  await run.click();

  // The verdict surface appears once the run resolves: a score and the next-step
  // actions are always present on a completed verdict.
  const verdict = page.locator(".assay-verdict");
  await expect(verdict).toBeVisible({ timeout: 110_000 });
  await expect(page.locator(".assay-verdict-score")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /test another agent/i })).toBeVisible({ timeout: 10_000 });
});
