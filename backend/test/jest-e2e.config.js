/** End-to-end tests: real HTTP against the innovexify_test database. Run with `npm run test:e2e`. */
module.exports = {
  rootDir: "..",
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "js", "json"],
  testMatch: ["<rootDir>/test/**/*.e2e-spec.ts"],
  transform: { "^.+\.ts$": ["ts-jest", { tsconfig: "tsconfig.json", diagnostics: false }] },
  setupFiles: ["<rootDir>/test/setup-env.ts"],
  setupFilesAfterEnv: ["<rootDir>/test/setup-forbidden.ts"],
  testTimeout: 30000,
  maxWorkers: 1,
};
