/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
const { assertTestDatabase, databaseName, isTestDatabaseName } = require("../../scripts/assert-test-database") as {
  assertTestDatabase: (url: string, who: string) => string;
  databaseName: (url: string) => string;
  isTestDatabaseName: (name: string) => boolean;
};

describe("test database guard", () => {
  it("reads the database name from a URL, ignoring the query string", () => {
    expect(databaseName("postgresql://u:p@localhost:5432/innovexify_e2e?schema=public")).toBe("innovexify_e2e");
    expect(databaseName("not a url")).toBe("");
  });

  it.each(["innovexify_e2e", "innovexify_test", "x_e2e"])("accepts %s", (name) => {
    expect(isTestDatabaseName(name)).toBe(true);
    expect(assertTestDatabase(`postgresql://u:p@localhost:5432/${name}?schema=public`, "test")).toBe(name);
  });

  it.each(["innovexify", "innovexify_e2e_backup", "e2e", "_test", "prod_testing", ""])("refuses %p", (name) => {
    expect(isTestDatabaseName(name)).toBe(false);
    expect(() => assertTestDatabase(`postgresql://u:p@localhost:5432/${name}`, "The backend test setup")).toThrow(/is not a test database/);
  });

  it("says who refused, which database, and what to do", () => {
    expect(() => assertTestDatabase("postgresql://u:p@localhost:5432/innovexify", "The backend test setup")).toThrow(
      'The backend test setup refused to run: it was pointed at the database "innovexify", which is not a test database.',
    );
  });
});
