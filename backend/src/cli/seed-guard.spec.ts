import { spawnSync } from "node:child_process";
import path from "node:path";

const backend = path.resolve(__dirname, "..", "..");

/** Runs the real prisma/seed.ts. It must stop at the guard, before any database connection is made. */
function runSeed(env: Record<string, string>) {
  return spawnSync(process.execPath, [require.resolve("ts-node/dist/bin.js"), "--transpile-only", "prisma/seed.ts"], {
    cwd: backend,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "postgresql://nobody:nothing@127.0.0.1:1/never_connected?schema=public", SEED_PASSWORD: "Seed-Password-2026", ...env },
    timeout: 60_000,
  });
}

describe("prisma/seed.ts", () => {
  it("refuses to run when NODE_ENV=production, with no override", () => {
    const result = runSeed({ NODE_ENV: "production" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing to seed: NODE_ENV is production.");
    expect(result.stderr).toContain("npm run admin:create");
  });

  it("ignores the old ALLOW_PROD_SEED override", () => {
    const result = runSeed({ NODE_ENV: "production", ALLOW_PROD_SEED: "true" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing to seed");
  });
});
