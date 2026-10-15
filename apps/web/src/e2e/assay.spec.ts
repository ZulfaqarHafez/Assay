import { expect, test } from "@playwright/test";

// End-to-end smoke test for the Assay product: the agent.md intake front door,
// the supported workspace route (Experiments), the command palette, the no-key
// lint path, and a full run-to-verdict against a real model when the API has a
// key. There is no stand-in grader. Legacy Agents/Suites routes are gone.

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type ApiHealth = { up: boolean; openaiConfigured: boolean };

async function apiHealth(request: import("@playwright/test").APIRequestContext): Promise<ApiHealth> {
  try {
    const response = await request.get(`${apiBase}/health`, { timeout: 4000 });
    if (!response.ok()) return { up: false, openaiConfigured: false };
    const body = (await response.json()) as { openai_configured?: boolean };
    return { up: true, openaiConfigured: Boolean(body.openai_configured) };
  } catch {
    return { up: false, openaiConfigured: false };
  }
}

test("intake screen renders the core controls", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Brand lives in the persistent top nav; value prop leads the page.
  await expect(page.getByRole("link", { name: /Assay home/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /prove your agent/i })).toBeVisible();
  // Cold load keeps the primary action useful: run (or, without a model key,
  // lint) a sample until the user provides their own agent definition.
  await expect(
    page.locator(".assay-intake-actions").getByRole("button", { name: /sample verdict|lint the sample agent/i })
  ).toBeVisible();
  await expect(page.locator(".assay-intake-actions").getByRole("button", { name: /run.*guardrail test/i })).toHaveCount(0);
  // The input and at least one starter template are present.
  const input = page.getByRole("textbox", { name: /agent definition/i });
  await expect(input).toBeVisible();
  await input.click();
  await input.pressSequentially("# Smoke Agent\nYou are a cautious support agent.", { delay: 0 });
  await expect(input).toHaveValue("# Smoke Agent\nYou are a cautious support agent.");
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

test("without a model key, the intake lints and says the exam needs a key", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "covered once on desktop");
  const health = await apiHealth(page.request);
  test.skip(!health.up, `API not reachable at ${apiBase}; start it with "npm run dev:api"`);
  test.skip(health.openaiConfigured, "the API has a model key; the live run test covers this server");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/lints the definition only/i)).toBeVisible();

  const input = page.getByRole("textbox", { name: /agent definition/i });
  await input.click();
  await input.pressSequentially("# Ops Agent\n\n## Tools\n- `exec_shell(command)` run any shell command\n", { delay: 0 });

  const lint = page.locator(".assay-intake-actions").getByRole("button", { name: /lint the definition/i });
  await expect(lint).toBeEnabled({ timeout: 10_000 });
  await lint.click();

  await expect(page.getByText(/lint only - the guardrail exam did not run/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/OPENAI_API_KEY/).first()).toBeVisible();
  await expect(page.getByText("Dangerous capability granted: `exec_shell`")).toBeVisible();
  // No verdict is ever shown without a model behind it.
  await expect(page.locator(".assay-verdict")).toHaveCount(0);

  await page.getByRole("button", { name: /back to start/i }).click();
  await expect(page.getByRole("textbox", { name: /agent definition/i })).toBeVisible();
});

test("runs an agent.md through to a real verdict", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "full run is covered once on desktop");
  test.setTimeout(600_000); // a real model answers every probe
  const health = await apiHealth(page.request);
  test.skip(!health.up, `API not reachable at ${apiBase}; start it with "npm run dev:api"`);
  test.skip(!health.openaiConfigured, "needs an API with OPENAI_API_KEY: the exam always runs a real model");

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
  await expect(verdict).toBeVisible({ timeout: 580_000 });
  await expect(page.locator(".assay-verdict-score")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".assay-verdict-stamp")).not.toHaveText(/unverified/i);
  await expect(
    page.locator(".assay-verdict-actions").getByRole("button", { name: /rerun same agent/i })
  ).toBeVisible({ timeout: 10_000 });
});
