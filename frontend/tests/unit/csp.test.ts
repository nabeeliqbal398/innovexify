import { describe, expect, it, vi } from "vitest";

import { buildCsp, makeNonce } from "@/lib/csp";

const directive = (csp: string, name: string): string[] => {
  const found = csp.split("; ").find((d) => d.startsWith(`${name} `));
  return found ? found.slice(name.length + 1).split(" ") : [];
};

describe("the Content-Security-Policy", () => {
  const csp = buildCsp("abc123");

  it("allows scripts only from this origin and the one nonce, with no unsafe-inline and no eval", () => {
    expect(directive(csp, "script-src")).toEqual(["'self'", "'nonce-abc123'"]);
  });

  it("allows eval only while developing, for hot reload", () => {
    expect(directive(buildCsp("n", true), "script-src")).toContain("'unsafe-eval'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("forbids being framed, base-tag changes and cross-site form posts", () => {
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "form-action")).toEqual(["'self'"]);
  });

  it("keeps everything else on this origin, plus the data: and blob: URLs the app itself makes", () => {
    expect(directive(csp, "default-src")).toEqual(["'self'"]);
    expect(directive(csp, "connect-src")).toEqual(["'self'"]);
    expect(directive(csp, "img-src")).toEqual(["'self'", "data:", "blob:"]);
    expect(directive(csp, "frame-src")).toEqual(["'self'", "blob:"]);
  });

  it("names no other host anywhere", () => {
    expect(csp).not.toMatch(/https?:|\*/);
  });
});

describe("makeNonce", () => {
  it("is different every time and safe to put in a header", () => {
    const a = makeNonce();
    const b = makeNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(atob(a).length).toBeGreaterThanOrEqual(32);
  });
});

describe("zod under the policy", () => {
  it("does not try to compile a parser with eval (the policy forbids it)", async () => {
    await import("@/lib/z");
    const { z } = await import("@/lib/z");
    expect(z.config().jitless).toBe(true);
    const spy = vi.spyOn(globalThis, "Function");
    z.object({ a: z.string() }).parse({ a: "x" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
