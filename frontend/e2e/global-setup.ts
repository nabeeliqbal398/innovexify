import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { E2E_API_PORT, E2E_WEB_PORT, MAIL_OUTBOX, backendDir, databaseUrl, seedPassword } from "./env";

const backend = backendDir;
// The one rule shared with the backend tests: only a database whose name ends in _e2e or _test may be wiped.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assertTestDatabase } = require(path.join(backend, "scripts/assert-test-database.js")) as { assertTestDatabase: (url: string, who: string) => string };

function run(args: string[], env: Record<string, string>): void {
  const result = spawnSync(process.execPath, args, { cwd: backend, env: { ...process.env, ...env }, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`"node ${args.join(" ")}" failed with exit code ${result.status}`);
}

async function waitForApi(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`The test API stopped with exit code ${child.exitCode} before it was ready.`);
    try {
      const res = await fetch(`http://127.0.0.1:${E2E_API_PORT}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("The test API did not become healthy within 60 seconds.");
}

/**
 * Runs once before the browser tests, after Playwright has started the web app:
 *  1. refuses unless the database is a test database (name ends in _e2e or _test), so the development data is never touched;
 *  2. creates that database from scratch, applies every migration and loads the demo data;
 *  3. starts the API against it. (This is not a webServer entry because Playwright starts those BEFORE global setup, and the API
 *     cannot start before its database exists.)
 * The returned function stops the API when the run ends.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const url = databaseUrl();
  const name = assertTestDatabase(url, "The browser tests");
  process.stdout.write(`Browser tests use the database "${name}" (never the development database).\n`);

  const env: Record<string, string> = { E2E_DATABASE_URL: url, DATABASE_URL: url, NODE_ENV: "development", SEED_PASSWORD: seedPassword() };
  run(["scripts/setup-test-db.js", "e2e", "--reset"], env);
  // The seed is run directly (not through `prisma db seed`, which looks for ts-node on the PATH that npm normally provides).
  run([require.resolve("ts-node/dist/bin.js", { paths: [backend] }), "--transpile-only", "prisma/seed.ts"], env);

  fs.rmSync(MAIL_OUTBOX, { force: true });
  fs.rmSync(path.resolve(__dirname, ".storage"), { recursive: true, force: true });

  if (!fs.existsSync(path.join(backend, "dist/main.js"))) throw new Error("backend/dist/main.js is missing. Run `npm run test:e2e` (it builds first) or `npm run build` in the backend.");
  const api = spawn(process.execPath, ["dist/main.js"], {
    cwd: backend,
    env: {
      ...process.env,
      ...env,
      PORT: String(E2E_API_PORT),
      APP_URL: `http://localhost:${E2E_WEB_PORT}`,
      CORS_ORIGINS: `http://localhost:${E2E_WEB_PORT}`,
      AUTH_THROTTLE_LIMIT: "2000",
      THROTTLE_LIMIT: "100000",
      MESSAGE_RATE_LIMIT_PER_MIN: "1000",
      SEARCH_RATE_LIMIT_PER_MIN: "1000",
      MAIL_TRANSPORT: "log",
      MAIL_OUTBOX_FILE: MAIL_OUTBOX,
      STORAGE_DIR: path.resolve(__dirname, ".storage"),
      LOG_LEVEL: "warn",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  await waitForApi(api);

  return async () => {
    api.kill();
    await new Promise((r) => setTimeout(r, 300));
  };
}
