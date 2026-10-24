/* eslint-disable */
// One rule for every test runner (backend jest, frontend Playwright): tests wipe tables, so they may only touch a database whose
// name ends in _e2e or _test. Used by scripts/setup-test-db.js, test/setup-env.ts and frontend/e2e/global-setup.ts.
const SUFFIXES = ["_e2e", "_test"];

/** The database name in a postgres:// URL, or "" when there is none. */
function databaseName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

function isTestDatabaseName(name) {
  return SUFFIXES.some((suffix) => name.length > suffix.length && name.endsWith(suffix));
}

/** Throws (with a message that says what to do) unless the URL points at a test database. */
function assertTestDatabase(url, who) {
  const name = databaseName(url);
  if (!isTestDatabaseName(name)) {
    throw new Error(
      `${who} refused to run: it was pointed at the database "${name || "(none)"}", which is not a test database.\n` +
        `These tests delete data. The database name must end in ${SUFFIXES.join(" or ")} (for example innovexify_e2e).\n` +
        `Point E2E_DATABASE_URL at a throw-away database, or unset it to use the default.`,
    );
  }
  return name;
}

module.exports = { assertTestDatabase, databaseName, isTestDatabaseName, SUFFIXES };
