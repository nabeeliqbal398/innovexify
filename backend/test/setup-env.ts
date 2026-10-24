import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { config as loadDotenv } from "dotenv";
import { expand } from "dotenv-expand";

// Load .env first so secrets and POSTGRES_* are available, then point everything at the test database.
expand(loadDotenv({ path: path.join(__dirname, "..", ".env"), quiet: true }));

const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_PORT = "5432", POSTGRES_DB } = process.env;
const derived = `postgresql://${encodeURIComponent(POSTGRES_USER ?? "")}:${encodeURIComponent(POSTGRES_PASSWORD ?? "")}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}_test?schema=public&connection_limit=5`;
const url = process.env.E2E_DATABASE_URL || derived;

// Hard stop: these tests wipe tables, so they may never run against a database whose name does not end in _e2e or _test.
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
require("../scripts/assert-test-database").assertTestDatabase(url, "The backend test setup");

process.env.DATABASE_URL = url;
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
// Lets each test present its own client address, so the 5-per-minute login limit only bites where a test asks for it.
process.env.TRUST_PROXY = "true";
// Tests never send real email, whatever a developer has in .env.
process.env.MAIL_TRANSPORT = "log";
for (const name of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM", "MAIL_OUTBOX_FILE"]) delete process.env[name];
process.env.ALLOW_BODY_REFRESH = "false";
process.env.REFRESH_COOKIE_SAMESITE = "strict";
process.env.REFRESH_COOKIE_SECURE = "false";
process.env.LOGIN_MAX_ATTEMPTS = "5";
process.env.LOGIN_LOCKOUT_MINUTES = "15";

// Uploaded files go to a throw-away folder, never to the real STORAGE_DIR.
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "innovexify-test-storage-"));
process.env.MAX_UPLOAD_MB = "25";
