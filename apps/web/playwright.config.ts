import { defineConfig, devices } from "@playwright/test";

const port = process.env.PORT ?? "3000";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const webServerCommand = process.env.CI
  ? `npx next start --hostname 127.0.0.1 --port ${port}`
  : `npx next dev --hostname 127.0.0.1 --port ${port}`;

export default defineConfig({
  testDir: "./src/e2e",
  timeout: 30000,
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: webServerCommand,
        url: baseURL,
        timeout: 120000,
        reuseExistingServer: true
      }
});
