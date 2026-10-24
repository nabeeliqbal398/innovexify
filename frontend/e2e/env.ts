import fs from "node:fs";
import path from "node:path";

/** Ports, paths and the database for the browser tests: one place, shared by the config, the setup and the helpers. */
export const E2E_API_PORT = 4100;
export const E2E_WEB_PORT = 3100;
export const MAIL_OUTBOX = path.resolve(__dirname, ".mail-outbox.jsonl");
export const backendDir = path.resolve(__dirname, "../../backend");

/** KEY=value pairs from backend/.env (a developer machine); in CI the same names come from the environment. */
function dotenv(): Record<string, string> {
  const file = path.join(backendDir, ".env");
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match?.[1] && !line.trimStart().startsWith("#")) out[match[1]] = (match[2] ?? "").replace(/^"(.*)"$/, "$1");
  }
  return out;
}

const setting = (name: string): string | undefined => process.env[name] || dotenv()[name];

/** Every seeded account uses this password. */
export function seedPassword(): string {
  const value = setting("SEED_PASSWORD");
  if (!value) throw new Error("SEED_PASSWORD is not set (in backend/.env or the environment).");
  return value.trim();
}

/**
 * The database the browser tests use: E2E_DATABASE_URL when set, otherwise <POSTGRES_DB>_e2e on the same server as development
 * (innovexify_e2e), which global setup creates. Whatever it is, global setup refuses it unless its name ends in _e2e or _test.
 */
export function databaseUrl(): string {
  const explicit = setting("E2E_DATABASE_URL");
  if (explicit) return explicit;
  const user = setting("POSTGRES_USER");
  const password = setting("POSTGRES_PASSWORD");
  const db = setting("POSTGRES_DB");
  if (!user || !password || !db) throw new Error("POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB must be set (in backend/.env or the environment).");
  const host = setting("POSTGRES_HOST") ?? "localhost";
  const port = setting("POSTGRES_PORT") ?? "5432";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}_e2e?schema=public`;
}
