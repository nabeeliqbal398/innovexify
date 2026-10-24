
import { defineConfig, devices } from "@playwright/test";

import { E2E_API_PORT, E2E_WEB_PORT } from "./e2e/env";

/**
 * Browser tests run against the REAL backend and their own database (innovexify_e2e, never the development one), on their own
 * ports so a development server on 3000/4000 is left alone: API on 4100, the built Next app on 3100 (its /api proxy points at 4100).
 * `e2e/prepare.mjs` (run by `npm run test:e2e`) builds both apps; `e2e/global-setup.ts` refuses any database whose name does not end
 * in _e2e or _test, creates and migrates it, loads the demo data and starts the API on it.
 */
export { E2E_API_PORT, E2E_WEB_PORT };

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: `http://localhost:${E2E_WEB_PORT}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${E2E_WEB_PORT}`,
    cwd: __dirname,
    url: `http://localhost:${E2E_WEB_PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { API_ORIGIN: `http://localhost:${E2E_API_PORT}`, NEXT_DIST_DIR: ".next-e2e", NODE_ENV: "production", PORT: String(E2E_WEB_PORT) },
  },
});

