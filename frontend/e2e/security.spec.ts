import { expect, test, type Page } from "@playwright/test";

import { signIn, watchCsp } from "./helpers";

/** The value of one directive in a Content-Security-Policy header, as a list of sources. */
function directive(csp: string, name: string): string[] {
  const found = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `));
  return found ? found.slice(name.length + 1).split(/\s+/) : [];
}

const nonceOf = (csp: string): string => (/'nonce-([^']+)'/.exec(directive(csp, "script-src").join(" "))?.[1] ?? "");

async function documentHeaders(page: Page, path: string): Promise<Record<string, string>> {
  const response = await page.goto(path);
  return (response?.headers() ?? {}) as Record<string, string>;
}

test.describe("response headers and the Content-Security-Policy", () => {
  test("every page carries a per-request nonce policy that allows no other inline script, and forbids framing", async ({ page }) => {
    const first = await documentHeaders(page, "/");
    const csp = first["content-security-policy"] ?? "";
    expect(csp).not.toBe("");

    const scriptSrc = directive(csp, "script-src");
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc.some((s) => s.startsWith("'nonce-"))).toBe(true);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc.filter((s) => /^https?:|\*/.test(s))).toEqual([]);
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "default-src")).toEqual(["'self'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "form-action")).toEqual(["'self'"]);

    // A new nonce for every request.
    const nonce = nonceOf(csp);
    const second = await documentHeaders(page, "/");
    expect(nonceOf(second["content-security-policy"] ?? "")).not.toBe(nonce);

    // Every inline script on the page (Next's own and the theme-init script) carries that request's nonce.
    const secondNonce = nonceOf(second["content-security-policy"] ?? "");
    const inline = await page.evaluate(() => [...document.scripts].filter((s) => !s.src).map((s) => s.nonce));
    expect(inline.length).toBeGreaterThan(0);
    expect(inline.every((n) => n === secondNonce)).toBe(true);

    expect(second["x-content-type-options"]).toBe("nosniff");
    expect(second["referrer-policy"]).toBe("no-referrer");
    expect(second["x-frame-options"]).toBe("DENY");
    expect(second["permissions-policy"]).toContain("camera=()");
    expect(second["strict-transport-security"]).toMatch(/max-age=\d{7,}/);
    expect(second["x-powered-by"]).toBeUndefined();
  });

  test("a script injected into the page without the nonce does not run, and the browser reports it", async ({ page }) => {
    const csp = await watchCsp(page);
    await page.goto("/");
    await page.evaluate(() => {
      const script = document.createElement("script");
      script.textContent = "window.__injected = true";
      document.body.appendChild(script);
    });
    expect(await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected)).toBeUndefined();
    await expect.poll(() => csp.violations().then((v) => v.length)).toBeGreaterThan(0);
  });

  test("pages that carry a secret in the link are never cached", async ({ page }) => {
    for (const path of [`/reset-password/${"x".repeat(48)}`, `/invite/${"x".repeat(48)}`]) {
      const headers = await documentHeaders(page, path);
      expect(headers["cache-control"]).toContain("no-store");
    }
  });

  test("API responses keep the API's own security headers, through the web app's /api proxy", async ({ page }) => {
    for (const path of ["/api/health", "/api/v1/auth/me"]) {
      const response = await page.request.get(path);
      const headers = response.headers();
      expect(headers["x-content-type-options"]).toContain("nosniff");
      expect(headers["content-security-policy"]).toContain("default-src 'self'");
      expect(headers["strict-transport-security"]).toBeDefined();
      expect(headers["x-powered-by"]).toBeUndefined();
      expect(headers["access-control-allow-origin"]).toBeUndefined();
    }
    // The readiness probe is public and says only pass or fail.
    const ready = await page.request.get("/api/health/ready");
    expect(ready.status()).toBe(200);
    expect(await ready.json()).toMatchObject({ status: "ok", checks: { database: { ok: true }, storage: { ok: true } } });
    // The Swagger UI is a development tool: this API is not running in production, so it is on here; the production check is in the stack test.
  });

  test("the app works under the policy: every role's workspace, each screen in its navigation, and the public pages report no violation", async ({ browser }) => {
    test.setTimeout(300_000);
    const reports: string[] = [];
    for (const who of ["admin", "manager", "csr", "compliance", "client"] as const) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const csp = await watchCsp(page); // installed before the first navigation, so it sees the whole load
      await signIn(page, who);
      // Open every screen in the side navigation.
      const nav = page.getByRole("navigation").first();
      const labels = (await nav.getByRole("button").allInnerTexts()).map((t) => (t.split(/\r?\n/)[0] ?? "").trim()).filter(Boolean);
      for (const label of new Set(labels)) {
        const button = nav.getByRole("button", { name: label }).first();
        if (!(await button.isVisible().catch(() => false))) continue;
        await button.click();
        await page.locator("main").getByRole("heading", { level: 1 }).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
      }
      reports.push(...(await csp.violations()).map((v) => `${who}: ${v}`));
      await context.close();
    }
    expect(reports).toEqual([]);

    // The public pages too.
    const page = await (await browser.newContext()).newPage();
    const csp = await watchCsp(page);
    for (const path of ["/", "/forgot-password", `/reset-password/${"x".repeat(48)}`, `/invite/${"x".repeat(48)}`, "/no-such-page"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(await csp.violations()).toEqual([]);
  });
});
