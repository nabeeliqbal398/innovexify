import { violations } from "./forbidden-fields";

afterEach(() => {
  if (violations.length === 0) return;
  const report = violations.map((v) => `${v.url} returned ${v.field} at ${v.path}`).join("\n");
  violations.length = 0;
  throw new Error(`A response contained a forbidden field:\n${report}`);
});
