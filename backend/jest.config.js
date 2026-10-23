/** Unit tests: fast, no database. */
module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "js", "json"],
  testMatch: ["<rootDir>/src/**/*.spec.ts"],
  transform: { "^.+\.ts$": ["ts-jest", { tsconfig: "tsconfig.json", diagnostics: true }] },
};
