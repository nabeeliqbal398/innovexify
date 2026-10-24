import fs from "node:fs";
import path from "node:path";

import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { MAIL_OUTBOX, backendDir, databaseUrl, seedPassword as readSeedPassword } from "./env";

/** Every seeded account uses the password from backend/.env (or SEED_PASSWORD in the environment). */
export const seedPassword = readSeedPassword;

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

interface OutboxMail {
  at: string;
  to: string;
  kind: string;
  subject: string;
  text: string;
}

function outbox(): OutboxMail[] {
  if (!fs.existsSync(MAIL_OUTBOX)) return [];
  return fs
    .readFileSync(MAIL_OUTBOX, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OutboxMail);
}

/** How many emails of one kind have been "sent" to an address so far (take it before the action, wait with waitForEmail after). */
export function emailCount(to: string, kind: string): number {
  return outbox().filter((m) => m.to === to && m.kind === kind).length;
}

/** Wait for the next email of a kind to an address (the one after `seen` earlier ones) and return it. */
export async function waitForEmail(to: string, kind: string, seen = 0): Promise<OutboxMail> {
  await expect.poll(() => emailCount(to, kind), { timeout: 20_000, message: `no ${kind} email to ${to}` }).toBeGreaterThan(seen);
  return outbox().filter((m) => m.to === to && m.kind === kind)[seen] as OutboxMail;
}

export function resetPath(text: string): string {
  const match = /(\/reset-password\/[\w-]+)/.exec(text);
  if (!match?.[1]) throw new Error("No reset link in the email");
  return match[1];
}

/**
 * Records every Content-Security-Policy violation the page reports, both as the browser's console message and as a
 * securitypolicyviolation event. Call before navigating; read `violations()` at the end of the test.
 */
export async function watchCsp(page: Page): Promise<{ violations: () => Promise<string[]> }> {
  const consoleHits: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/content security policy|refused to (load|execute|apply|connect|frame)/i.test(text)) consoleHits.push(text);
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => w.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI || "inline"} (${e.sourceFile || "page"}:${e.lineNumber})`));
  });
  return {
    violations: async () => [...consoleHits, ...((await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []).catch(() => [])) as string[])],
  };
}

/** Run SQL against the browser-test database ONLY (never the development one), for what the UI cannot do, such as ageing a link. */
export async function e2eSql(statement: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { assertTestDatabase } = require(path.join(backendDir, "scripts/assert-test-database.js")) as { assertTestDatabase: (url: string, who: string) => string };
  const url = databaseUrl();
  assertTestDatabase(url, "e2eSql");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require(path.join(backendDir, "node_modules/@prisma/client")) as {
    PrismaClient: new (options: { datasourceUrl: string }) => { $executeRawUnsafe: (sql: string) => Promise<number>; $disconnect: () => Promise<void> };
  };
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await prisma.$executeRawUnsafe(statement);
  } finally {
    await prisma.$disconnect();
  }
}

/** A real 1x1 PNG, so the browser can actually draw it. */
export function pngFile(name = "ID photo.png"): { name: string; mimeType: string; buffer: Buffer } {
  const data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
  return { name, mimeType: "image/png", buffer: Buffer.from(data, "base64") };
}
