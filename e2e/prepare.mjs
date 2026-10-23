// Runs before Playwright starts its servers (`npm run test:e2e`): a freshly reset and seeded database, an API build, and a
// production build of the frontend whose /api rewrite points at the test API (Next reads the rewrite when it builds).
// E2E_SKIP_RESET=1 keeps the current database and E2E_SKIP_BUILD=1 keeps the last builds (for re-running one failing test).
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = path.resolve(frontend, "../backend");
const API_PORT = 4100;

function run(command, cwd, env = {}) {
  execSync(command, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
}

if (!process.env.E2E_SKIP_RESET) run("npm run db:reset", backend);
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
