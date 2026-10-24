import { redactUrl } from "./redact";

describe("redactUrl", () => {
  const token = "Zm9vYmFyLXNlY3JldC10b2tlbi0xMjM0NTY3ODkwYWJjZGVm";

  it.each(["/api/v1/auth/reset-password/", "/api/v1/auth/invitations/", "/api/auth/RESET-PASSWORD/"])("hides the token after %s", (prefix) => {
    const out = redactUrl(`${prefix}${token}?x=1`);
    expect(out).not.toContain(token);
    expect(out).toContain("[REDACTED]");
    expect(out).toContain("?x=1");
  });

  it("leaves every other path alone, and copes with nothing at all", () => {
    expect(redactUrl("/api/v1/auth/login")).toBe("/api/v1/auth/login");
    expect(redactUrl("/api/v1/documents/abc/download")).toBe("/api/v1/documents/abc/download");
    expect(redactUrl(undefined)).toBe("");
  });
});
