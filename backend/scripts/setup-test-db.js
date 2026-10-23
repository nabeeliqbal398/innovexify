/* eslint-disable */
// Creates the innovexify_test database inside the same Docker Postgres and applies every migration to it.
// Safe to run repeatedly. It only ever touches a database whose name ends in "_test".
const { spawnSync } = require("node:child_process");
const path = require("node:path");

require("dotenv-expand").expand(require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true }));

const user = process.env.POSTGRES_USER;
const password = process.env.POSTGRES_PASSWORD;
const port = process.env.POSTGRES_PORT || "5432";
const testDb = `${process.env.POSTGRES_DB}_test`;

function fail(message) {
  process.stderr.write(`test:db failed: ${message}\n`);
  process.exit(1);
}

if (!user || !password || !process.env.POSTGRES_DB) fail("POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB must be set in .env.");
if (!testDb.endsWith("_test")) fail(`refusing to touch "${testDb}": the test database name must end in _test.`);

const root = path.join(__dirname, "..");
// No shell: arguments reach the program exactly as written (a shell would split the SQL on spaces on Windows).
const run = (command, args, env) => spawnSync(command, args, { cwd: root, encoding: "utf8", env: { ...process.env, ...env } });

// 1. The container must be up and healthy.
const up = run("docker", ["compose", "up", "-d", "db", "--wait"]);
if (up.status !== 0) fail(`could not start the database container. Is Docker Desktop running?\n${up.stderr}`);

// 2. Create the test database if it doesn't exist.
const exists = run("docker", ["compose", "exec", "-T", "db", "psql", "-U", user, "-d", "postgres", "-tAc", `SELECT 1 FROM pg_database WHERE datname='${testDb}'`]);
if (exists.status !== 0) fail(`could not query Postgres.\n${exists.stderr}`);
if (exists.stdout.trim() !== "1") {
  const created = run("docker", ["compose", "exec", "-T", "db", "psql", "-U", user, "-d", "postgres", "-c", `CREATE DATABASE ${testDb}`]);
  if (created.status !== 0) fail(`could not create ${testDb}.\n${created.stderr}`);
  process.stdout.write(`created database ${testDb}\n`);
}

// Test data is disposable, so commits need not wait for the disk. Cuts the suite's time several-fold on Docker Desktop.
const relaxed = run("docker", ["compose", "exec", "-T", "db", "psql", "-U", user, "-d", "postgres", "-c", `ALTER DATABASE ${testDb} SET synchronous_commit = off`]);
if (relaxed.status !== 0) fail(`could not tune ${testDb}.
${relaxed.stderr}`);

// 3. Apply all migrations to it (never db push).
const url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@localhost:${port}/${testDb}?schema=public`;
const prismaCli = require.resolve("prisma/build/index.js");
const migrate = run(process.execPath, [prismaCli, "migrate", "deploy"], { DATABASE_URL: url });
process.stdout.write(migrate.stdout);
if (migrate.status !== 0) fail(`migrations failed on ${testDb}.\n${migrate.stderr}`);
process.stdout.write(`${testDb} is ready\n`);
