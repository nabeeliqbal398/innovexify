/* eslint-disable */
// Creates a throw-away database next to the development one and applies every migration to it. Safe to run repeatedly.
//   node scripts/setup-test-db.js            -> <POSTGRES_DB>_test  (backend e2e tests)
//   node scripts/setup-test-db.js e2e        -> <POSTGRES_DB>_e2e   (browser tests)
//   node scripts/setup-test-db.js e2e --reset   also drops it first, so it starts empty
// E2E_DATABASE_URL overrides the target (CI uses it). The name MUST end in _e2e or _test: anything else is refused, because these
// databases are wiped. Needs the database server to be running; on a developer machine this starts the Docker container first.
const { spawnSync } = require("node:child_process");
const path = require("node:path");

require("dotenv-expand").expand(require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true }));
const { PrismaClient } = require("@prisma/client");
const { assertTestDatabase, databaseName } = require("./assert-test-database");

const kind = process.argv[2] === "e2e" ? "e2e" : "test";
const reset = process.argv.includes("--reset");

function fail(message) {
  process.stderr.write(`test:db failed: ${message}\n`);
  process.exit(1);
}

/** The target database URL: E2E_DATABASE_URL, or one built from the POSTGRES_* values with the test suffix. */
function targetUrl() {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const { POSTGRES_USER: user, POSTGRES_PASSWORD: password, POSTGRES_DB: db, POSTGRES_HOST: host = "localhost", POSTGRES_PORT: port = "5432" } = process.env;
  if (!user || !password || !db) fail("POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB must be set (in .env or the environment).");
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}_${kind}?schema=public`;
}

async function main() {
  const url = targetUrl();
  let name;
  try {
    name = assertTestDatabase(url, "test:db");
  } catch (e) {
    fail(e.message);
  }
  // The name goes into SQL below, so beyond the suffix rule it may only contain identifier characters.
  if (!/^[A-Za-z0-9_]+$/.test(name)) fail(`refusing "${name}": a test database name may only contain letters, digits and underscores.`);

  // On a developer machine the database is the Docker container; in CI it is a service that is already running.
  if (!process.env.CI && !process.env.E2E_DATABASE_URL) {
    const up = spawnSync("docker", ["compose", "up", "-d", "db", "--wait"], { cwd: path.join(__dirname, ".."), encoding: "utf8" });
    if (up.status !== 0) fail(`could not start the database container. Is Docker Desktop running?\n${up.stderr}`);
  }

  // Administer through the server's own "postgres" database, with the same credentials.
  const admin = new URL(url);
  admin.pathname = "/postgres";
  admin.search = "";
  const prisma = new PrismaClient({ datasources: { db: { url: admin.toString() } } });
  try {
    if (reset) {
      await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      process.stdout.write(`dropped database ${name}\n`);
    }
    const exists = await prisma.$queryRawUnsafe(`SELECT 1 AS found FROM pg_database WHERE datname = '${name}'`);
    if (exists.length === 0) {
      await prisma.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
      process.stdout.write(`created database ${name}\n`);
    }
    // Test data is disposable, so commits need not wait for the disk. Cuts the suite's time several-fold on Docker Desktop.
    await prisma.$executeRawUnsafe(`ALTER DATABASE "${name}" SET synchronous_commit = off`);
  } catch (e) {
    fail(`could not prepare ${name}: ${e.message}`);
  } finally {
    await prisma.$disconnect();
  }

  // Apply all migrations to it (never db push).
  const prismaCli = require.resolve("prisma/build/index.js");
  const migrate = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: url },
  });
  process.stdout.write(migrate.stdout);
  if (migrate.status !== 0) fail(`migrations failed on ${name}.\n${migrate.stderr}`);
  process.stdout.write(`${name} is ready\n`);
}

main().catch((e) => fail(e.message));
