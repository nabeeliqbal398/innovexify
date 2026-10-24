// Runs before Playwright (`npm run test:e2e`): refuses to go on unless the target database is a test database, then builds the
// API and a production build of the frontend whose /api rewrite points at the test API (Next reads the rewrite when it builds).
// It never touches a database itself: e2e/global-setup.ts creates, migrates and seeds innovexify_e2e (not the development database).
// E2E_SKIP_BUILD=1 keeps the last builds (for re-running one failing test).
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = path.resolve(frontend, "../backend");
const API_PORT = 4100;
const require = createRequire(import.meta.url);

function run(command, cwd, env = {}) {
  execSync(command, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
}

// The same rule global setup applies, checked first so a wrong target fails in a second instead of after a long build.
const { assertTestDatabase } = require(path.join(backend, "scripts/assert-test-database.js"));
const explicit = process.env.E2E_DATABASE_URL;
if (explicit) {
  try {
    assertTestDatabase(explicit, "The browser tests");
  } catch (error) {
    process.stderr.write(`\n${error.message}\n\n`);
    process.exit(1);
  }
}

if (!process.env.E2E_SKIP_BUILD) {
  run("npm run build", backend);
  run("npx next build", frontend, {
    API_ORIGIN: `http://localhost:${API_PORT}`,
    NEXT_DIST_DIR: ".next-e2e",
    NEXT_PUBLIC_ENABLE_DEMO_TOOLS: "true",
    NEXT_PUBLIC_E2E_HOOKS: "true",
  });
}
fs.rmSync(path.join(frontend, "e2e/.mail-outbox.jsonl"), { force: true });
fs.rmSync(path.join(frontend, "e2e/.storage"), { recursive: true, force: true });
