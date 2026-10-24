import { expect, test } from "@playwright/test";

import { ACCOUNTS, emailCount, e2eSql, openAs, resetPath, seedPassword, signIn, waitForEmail, watchCsp } from "./helpers";

// Ayesha Khan: no other browser test signs in as her, so her password can be changed here and put back at the end.
const EMAIL = ACCOUNTS.csr2.email;
const NEW_PASSWORD = "Fresh-Start-Passw0rd-1";
const SAME_PAGE = "Check your email";

/** Let the next reset request through: the API sends one link a minute per person, whatever the clicks. */
const ageResetLinks = () => e2eSql(`UPDATE "PasswordResetToken" SET "createdAt" = now() - interval '5 minutes'`);

test.describe("password reset", () => {
  test.afterEach(async () => {
    // Whatever happened, the account is left with the seed password for the other tests and the next run.
    await e2eSql(`UPDATE "PasswordResetToken" SET "usedAt" = now() WHERE "usedAt" IS NULL`);
  });

  test("someone who forgot their password resets it from the emailed link; other devices are signed out; the link works once", async ({ browser }) => {
    const original = seedPassword();
    const otherDevice = await openAs(browser, "csr2"); // already signed in somewhere else

    const context = await browser.newContext();
    const page = await context.newPage();
    const csp = await watchCsp(page);

    // From the sign-in page to the forgot page.
    await page.goto("/");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();

    // An address that is not an account gets exactly the same answer as a real one.
    await page.getByLabel("Email").fill("nobody.here@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: SAME_PAGE })).toBeVisible();
    const unknownText = await page.getByText("If an account exists for that email").first().innerText();
    expect(emailCount("nobody.here@example.com", "password-reset")).toBe(0);

    await page.goto("/forgot-password");
    const before = emailCount(EMAIL, "password-reset");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: SAME_PAGE })).toBeVisible();
    expect(await page.getByText("If an account exists for that email").first().innerText()).toBe(unknownText);

    // The email carries a one-time link.
    const mail = await waitForEmail(EMAIL, "password-reset", before);
    expect(mail.subject).toMatch(/Reset your .* password/);
    const link = resetPath(mail.text);

    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
    // Rules are checked as they type, before anything is sent.
    await page.getByLabel("New password", { exact: true }).fill("short");
    await page.getByLabel("Confirm new password").fill("different");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Use at least 12 characters with upper and lowercase letters and a number.")).toBeVisible();
    await expect(page.getByText("Passwords don't match.")).toBeVisible();

    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
    const changed = emailCount(EMAIL, "password-changed");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("heading", { name: "Password changed" })).toBeVisible();

    // The "your password was changed" notice is always sent.
    const notice = await waitForEmail(EMAIL, "password-changed", changed);
    expect(notice.text).toContain("every device was signed out");
    expect(JSON.stringify(notice)).not.toContain(NEW_PASSWORD);

    // The same link, from anywhere, now says it was used.
    const again = await (await browser.newContext()).newPage();
    await again.goto(link);
    await expect(again.getByRole("heading", { name: "This link was already used" })).toBeVisible();

    // The old password no longer works, the new one does.
    const wrong = await (await browser.newContext()).newPage();
    await wrong.goto("/");
    await wrong.locator("#login-email").fill(EMAIL);
    await wrong.locator("#login-password").fill(original);
    await wrong.getByRole("button", { name: "Sign in" }).click();
    await expect(wrong.getByRole("alert").first()).toContainText("don't match");
    const fresh = await (await browser.newContext()).newPage();
    await signIn(fresh, { email: EMAIL, password: NEW_PASSWORD });
    await expect(fresh).toHaveURL(/\/csr\/overview/);

    // The device that was signed in before is signed out (its refresh cookie was revoked).
    await otherDevice.page.reload();
    await expect(otherDevice.page.locator("#login-email")).toBeVisible();

    expect(await csp.violations()).toEqual([]);

    // Put the account back: reset again, to the seed password.
    await ageResetLinks();
    const second = emailCount(EMAIL, "password-reset");
    const restore = await (await browser.newContext()).newPage();
    await restore.goto("/forgot-password");
    await restore.getByLabel("Email").fill(EMAIL);
    await restore.getByRole("button", { name: "Send reset link" }).click();
    const restoreMail = await waitForEmail(EMAIL, "password-reset", second);
    await restore.goto(resetPath(restoreMail.text));
    await restore.getByLabel("New password", { exact: true }).fill(original);
    await restore.getByLabel("Confirm new password").fill(original);
    await restore.getByRole("button", { name: "Change password" }).click();
    await expect(restore.getByRole("heading", { name: "Password changed" })).toBeVisible();
    await signIn(await (await browser.newContext()).newPage(), "csr2");
  });

  test("a link that has expired says so, and offers a new one", async ({ browser }) => {
    await ageResetLinks();
    const context = await browser.newContext();
    const page = await context.newPage();
    const before = emailCount(EMAIL, "password-reset");
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByRole("button", { name: "Send reset link" }).click();
    const mail = await waitForEmail(EMAIL, "password-reset", before);

    await e2eSql(`UPDATE "PasswordResetToken" SET "expiresAt" = now() - interval '1 minute' WHERE "usedAt" IS NULL`);
    await page.goto(resetPath(mail.text));
    await expect(page.getByRole("heading", { name: "This reset link has expired" })).toBeVisible();
    await page.getByRole("button", { name: "Request a new link" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });

  test("a link that was copied wrongly says it is not valid", async ({ page }) => {
    await page.goto(`/reset-password/${"x".repeat(48)}`);
    await expect(page.getByRole("heading", { name: "This link isn't valid" })).toBeVisible();
    await page.getByRole("button", { name: "Back to sign in" }).click();
    await expect(page.locator("#login-email")).toBeVisible();
  });

  test("a suspended account gets the same answer and no email", async ({ browser }) => {
    const admin = await openAs(browser, "admin");
    // Suspend through the API as the Admin would from the staff screen, then ask for a link.
    const target = ACCOUNTS.csr2.email;
    await e2eSql(`UPDATE "User" SET "status" = 'Suspended' WHERE "email" = '${target}'`);
    try {
      const before = emailCount(target, "password-reset");
      await ageResetLinks();
      const page = await (await browser.newContext()).newPage();
      await page.goto("/forgot-password");
      await page.getByLabel("Email").fill(target);
      await page.getByRole("button", { name: "Send reset link" }).click();
      await expect(page.getByRole("heading", { name: SAME_PAGE })).toBeVisible();
      await page.waitForTimeout(1500); // the email, if there were one, is sent right after the answer
      expect(emailCount(target, "password-reset")).toBe(before);
    } finally {
      await e2eSql(`UPDATE "User" SET "status" = 'Active' WHERE "email" = '${target}'`);
      await admin.context.close();
    }
  });
});
