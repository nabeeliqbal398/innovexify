import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests run against the REAL backend and a freshly reset database, on their own ports so a development
 * server on 3000/4000 is left alone: API on 4100, the built Next app on 3100 (its /api proxy points at 4100).
 * `e2e/prepare.mjs` (run by `npm run test:e2e`) resets and seeds the database and builds both apps first.
 */
export const E2E_API_PORT = 4100;
export const E2E_WEB_PORT = 3100;
export const MAIL_OUTBOX = path.resolve(__dirname, "e2e/.mail-outbox.jsonl");
const backend = path.resolve(__dirname, "../backend");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
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
  webServer: [
    {
      command: "node dist/main.js",
      cwd: backend,
      url: `http://localhost:${E2E_API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(E2E_API_PORT),
        APP_URL: `http://localhost:${E2E_WEB_PORT}`,
        CORS_ORIGINS: `http://localhost:${E2E_WEB_PORT}`,
        AUTH_THROTTLE_LIMIT: "2000",
        THROTTLE_LIMIT: "100000",
        MESSAGE_RATE_LIMIT_PER_MIN: "1000",
        SEARCH_RATE_LIMIT_PER_MIN: "1000",
        MAIL_OUTBOX_FILE: MAIL_OUTBOX,
        STORAGE_DIR: path.resolve(__dirname, "e2e/.storage"),
        LOG_LEVEL: "warn",
      },
    },
    {
      command: `npx next start -p ${E2E_WEB_PORT}`,
      cwd: __dirname,
      url: `http://localhost:${E2E_WEB_PORT}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_ORIGIN: `http://localhost:${E2E_API_PORT}`, NEXT_DIST_DIR: ".next-e2e" },
    },
  ],
});
