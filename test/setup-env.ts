import path from "node:path";

import { config as loadDotenv } from "dotenv";
import { expand } from "dotenv-expand";

// Load .env first so secrets and POSTGRES_* are available, then point everything at the test database.
expand(loadDotenv({ path: path.join(__dirname, "..", ".env"), quiet: true }));

const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_PORT = "5432", POSTGRES_DB } = process.env;
const testDb = `${POSTGRES_DB}_test`;

// Hard stop: these tests wipe tables, so they may never run against the development database.
if (!testDb.endsWith("_test")) throw new Error("The e2e database name must end in _test.");

process.env.DATABASE_URL = `postgresql://${encodeURIComponent(POSTGRES_USER ?? "")}:${encodeURIComponent(POSTGRES_PASSWORD ?? "")}@localhost:${POSTGRES_PORT}/${testDb}?schema=public&connection_limit=5`;
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
// Lets each test present its own client address, so the 5-per-minute login limit only bites where a test asks for it.
process.env.TRUST_PROXY = "true";
process.env.ALLOW_BODY_REFRESH = "false";
process.env.REFRESH_COOKIE_SAMESITE = "strict";
process.env.REFRESH_COOKIE_SECURE = "false";
process.env.LOGIN_MAX_ATTEMPTS = "5";
process.env.LOGIN_LOCKOUT_MINUTES = "15";
