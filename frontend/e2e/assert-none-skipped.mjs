// Reads the Playwright JSON report and prints the totals. Exits 1 unless every test passed and none was skipped, flaky or
// marked fixme: "the suite is green" must mean the whole suite ran. Usage: node e2e/assert-none-skipped.mjs [report.json]
import fs from "node:fs";

const file = process.argv[2] ?? "playwright-results.json";
if (!fs.existsSync(file)) {
  process.stderr.write(`No report at ${file}. Run the suite with --reporter=list,json and PLAYWRIGHT_JSON_OUTPUT_NAME=${file}.\n`);
  process.exit(1);
}
const { stats } = JSON.parse(fs.readFileSync(file, "utf8"));
const total = stats.expected + stats.unexpected + stats.flaky + stats.skipped;
process.stdout.write(`Playwright: ${total} tests, ${stats.expected} passed, ${stats.unexpected} failed, ${stats.flaky} flaky, ${stats.skipped} skipped\n`);
if (stats.unexpected > 0 || stats.flaky > 0 || stats.skipped > 0 || total === 0) {
  process.stderr.write("Not clean: every test must pass, and none may be skipped.\n");
  process.exit(1);
}
