import fs from "node:fs";
import path from "node:path";

import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { MAIL_OUTBOX } from "../playwright.config";

/** Every seeded account uses the password in the backend's .env. */
export function seedPassword(): string {
  const env = fs.readFileSync(path.resolve(__dirname, "../../backend/.env"), "utf8");
  const match = /^SEED_PASSWORD=(.*)$/m.exec(env);
  if (!match?.[1]) throw new Error("SEED_PASSWORD is not set in backend/.env");
  return match[1].trim();
}

export const ACCOUNTS = {
  admin: { email: "sarah.bennett@example.com", home: "/admin/overview" },
  manager: { email: "daniel.reyes@example.com", home: "/manager/overview" },
  csr: { email: "john.smith@example.com", home: "/csr/overview" },
  csr2: { email: "ayesha.khan@example.com", home: "/csr/overview" },
  compliance: { email: "maya.chen@example.com", home: "/compliance/overview" },
  client: { email: "alex.morgan@northfield.co", home: "/client/home" },
} as const;
export type AccountKey = keyof typeof ACCOUNTS;

/** Sign in through the real form and wait for the workspace. */
export async function signIn(page: Page, who: AccountKey | { email: string; password: string }): Promise<void> {
  const email = typeof who === "string" ? ACCOUNTS[who].email : who.email;
  const password = typeof who === "string" ? seedPassword() : who.password;
  await page.goto("/");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(admin|manager|csr|compliance|client)\//);
}

/** A fresh browser context (its own cookies), signed in as one account. */
export async function openAs(browser: Browser, who: AccountKey): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, who);
  return { context, page };
}

/** The most recent email the API "sent" to an address (the log mailer appends each one to a file). */
export async function lastEmailTo(email: string): Promise<{ subject: string; text: string }> {
  await expect
    .poll(() => (fs.existsSync(MAIL_OUTBOX) ? fs.readFileSync(MAIL_OUTBOX, "utf8").includes(`"to":"${email}"`) : false), { timeout: 15_000 })
    .toBe(true);
  const lines = fs.readFileSync(MAIL_OUTBOX, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { to: string; subject: string; text: string });
  return [...lines].reverse().find((m) => m.to === email) as { subject: string; text: string };
}

export function invitationPath(text: string): string {
  const match = /(\/invite\/[\w-]+)/.exec(text);
  if (!match?.[1]) throw new Error("No invitation link in the email");
  return match[1];
}

/** A tiny but real PDF (the server checks the first bytes, not the name). */
export function pdfFile(name = "Proof of address.pdf"): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n1 0 obj <</Type /Catalog>> endobj\ntrailer <</Root 1 0 R>>\n%%EOF\n") };
}
