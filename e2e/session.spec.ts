import { expect, test } from "@playwright/test";

import { ACCOUNTS, signIn } from "./helpers";

test.describe("signing in and out", () => {
  test("an admin signs in and lands on the business overview", async ({ page }) => {
    await signIn(page, "admin");
    await expect(page).toHaveURL(/\/admin\/overview/);
    await expect(page.getByRole("heading", { name: "Business overview" })).toBeVisible();
    await expect(page.getByText("Signed in as")).toBeVisible();
  });

  test("a wrong password shows the server's message and stays on the sign-in page", async ({ page }) => {
    await page.goto("/");
    await page.locator("#login-email").fill(ACCOUNTS.admin.email);
    await page.locator("#login-password").fill("Definitely-Wrong-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").first()).toContainText("don't match");
    await expect(page).toHaveURL(/\/$/);
  });

  test("the session survives a reload (the refresh cookie), and the token is not in browser storage", async ({ page }) => {
    await signIn(page, "csr");
    await page.reload();
    await expect(page).toHaveURL(/\/csr\/overview/);
    await expect(page.getByRole("heading", { name: "My work" })).toBeVisible();
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    const token = await page.evaluate(() => (window as unknown as { __e2e: { token: () => string | null } }).__e2e.token());
    expect(token).toBeTruthy();
    expect(stored).not.toContain(token as string);
  });

  test("an emptied access token is renewed silently from the cookie", async ({ page }) => {
    await signIn(page, "manager");
    const before = await page.evaluate(() => (window as unknown as { __e2e: { token: () => string | null } }).__e2e.token());
    await page.evaluate(() => (window as unknown as { __e2e: { dropToken: () => void } }).__e2e.dropToken());
    // Open another screen: its first request fails with no token, one refresh happens, and the screen loads.
    await page.getByRole("button", { name: /Staff & Invitations|Team & Workload/ }).click();
    await expect(page.getByRole("heading", { name: /Team & Workload|Staff & Invitations/ })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __e2e: { token: () => string | null } }).__e2e.token())).not.toBe("");
    const after = await page.evaluate(() => (window as unknown as { __e2e: { token: () => string | null } }).__e2e.token());
    expect(after).not.toBe(before);
    await expect(page).toHaveURL(/\/manager\/staff/);
  });

  test("signing out clears the session: the cookie no longer works", async ({ page, context }) => {
    await signIn(page, "compliance");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("#login-email")).toBeVisible();
    await page.goto("/compliance/overview");
    await expect(page).toHaveURL(/\/$/); // sent back to sign in
    expect((await context.cookies()).filter((c) => c.name === "refresh_token" && c.value)).toHaveLength(0);
  });

  test("a client cannot open the admin workspace", async ({ page }) => {
    await signIn(page, "client");
    await page.goto("/admin/overview");
    await expect(page.getByRole("heading", { name: "This page doesn't exist" })).toBeVisible();
    await page.goto("/admin/security");
    await expect(page.getByRole("heading", { name: "This page doesn't exist" })).toBeVisible();
  });

  test("someone not signed in is sent to the sign-in page", async ({ page }) => {
    await page.goto("/admin/overview");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("#login-email")).toBeVisible();
  });
});
