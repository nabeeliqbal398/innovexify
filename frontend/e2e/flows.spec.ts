import { expect, test, type Page } from "@playwright/test";

import { invitationPath, lastEmailTo, openAs, pdfFile, seedPassword, signIn } from "./helpers";

/** Call the API as the signed-in person (the access token lives in the page's memory). */
async function apiGet<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(async (p) => {
    const token = (window as unknown as { __e2e: { token: () => string | null } }).__e2e.token();
    const res = await fetch(`/api/v1${p}`, { headers: { Authorization: `Bearer ${token}` } });
    return ((await res.json()) as { data: unknown }).data;
  }, path) as Promise<T>;
}

test.describe("people and documents", () => {
  test("a manager invites a client, the client accepts and uploads a document the team asked for", async ({ browser }) => {
    const email = `new.client.${Date.now()}@example.com`;
    const password = "Correct-Horse-9Battery";

    // The manager invites a client.
    const manager = await openAs(browser, "manager");
    await manager.page.goto("/manager/staff?invite=CLIENT");
    await manager.page.getByLabel("Full name").fill("Nora Newclient");
    await manager.page.getByLabel("Email", { exact: true }).fill(email);
    await manager.page.getByLabel("Assigned CSR").selectOption({ label: "John Smith" });
    await manager.page.getByRole("button", { name: "Send invitation", exact: true }).click();
    await expect(manager.page.getByText(`Client invitation sent to ${email}`)).toBeVisible();
    await expect(manager.page.getByText(email).first()).toBeVisible(); // now in "Pending invitations"

    // The invitation email carries a one-time link.
    const mail = await lastEmailTo(email);
    const link = invitationPath(mail.text);

    // The client opens it and chooses a password; a second visit shows the link is used.
    const client = await browser.newContext();
    const clientPage = await client.newPage();
    await clientPage.goto(link);
    await expect(clientPage.getByText(`Invitation for`)).toContainText(email);
    await clientPage.getByLabel("Create password").fill(password);
    await clientPage.getByLabel("Confirm password").fill(password);
    await clientPage.getByRole("button", { name: "Create account" }).click();
    await clientPage.waitForURL(/\/client\/home/);
    const other = await browser.newContext();
    const again = await other.newPage();
    await again.goto(link);
    await expect(again.getByRole("heading", { name: "You've already set up your account" })).toBeVisible();

    // Compliance asks the new client for a document...
    const compliance = await openAs(browser, "compliance");
    await compliance.page.getByRole("button", { name: "Documents" }).first().click();
    const clientSelect = compliance.page.getByLabel("Client", { exact: true });
    await expect(clientSelect.locator("option", { hasText: "Nora Newclient" })).toHaveCount(1);
    await clientSelect.selectOption((await clientSelect.locator("option", { hasText: "Nora Newclient" }).getAttribute("value")) as string);
    await compliance.page.getByLabel("Document name").fill("Proof of address (E2E)");
    await compliance.page.getByRole("button", { name: "Request from client" }).click();
    await expect(compliance.page.getByText(/Proof of address \(E2E\)/).first()).toBeVisible();

    // ...and the client uploads it.
    await clientPage.getByRole("button", { name: /Documents/ }).first().click();
    await clientPage.getByLabel("Upload Proof of address (E2E)").setInputFiles(pdfFile());
    await expect(clientPage.getByText("Awaiting review").first()).toBeVisible();

    await Promise.all([manager.context.close(), client.close(), other.close(), compliance.context.close()]);
  });

  test("the client's upload is refused when the file is not a real document", async ({ browser }) => {
    const client = await openAs(browser, "client");
    await client.page.getByRole("button", { name: /Documents/ }).first().click();
    // Wait for the Documents screen itself: the Home page shows this document's name too (twice), so asserting on the name alone matched Home
    // for the moment the navigation takes, and Playwright's strict matching failed on the two matches.
    await expect(client.page.getByRole("heading", { name: "Documents" })).toBeVisible();
    await expect(client.page.getByText("Proof of address (updated)")).toBeVisible();
    await client.page.getByLabel("Upload Proof of address (updated)").setInputFiles({ name: "program.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ not a document") });
    await expect(client.page.getByRole("alert").first()).toContainText(/PDF|PNG|JPG|DOCX|type/i);
    await expect(client.page.getByText("Awaiting review")).toHaveCount(1); // only the document that was already waiting
    await client.context.close();
  });
});

test.describe("scope", () => {
  test("a CSR cannot see or open another CSR's client", async ({ browser }) => {
    const admin = await openAs(browser, "admin");
    const c43 = await apiGet<{ id: string; case: { id: string } }>(admin.page, "/clients/c43");
    await admin.context.close();

    const csr = await openAs(browser, "csr"); // John Smith: Sarah Johnson belongs to Ayesha Khan
    await csr.page.getByRole("button", { name: "Clients" }).first().click();
    await csr.page.getByLabel("Search clients", { exact: true }).fill("Sarah Johnson");
    await expect(csr.page.getByText("No clients match")).toBeVisible();

    // Straight to the other CSR's case: the server answers "not found", the same as for a case that does not exist.
    await csr.page.goto(`/csr/clients?client=${c43.id}`);
    await expect(csr.page.getByRole("region", { name: "Client profile" })).toHaveCount(0);
    await csr.page.getByRole("button", { name: "Clients" }).first().click();
    const refusal = await csr.page.evaluate(async (id) => {
      const token = (window as unknown as { __e2e: { token: () => string | null } }).__e2e.token();
      const res = await fetch(`/api/v1/cases/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      return { status: res.status, body: (await res.json()) as { errorCode: string } };
    }, c43.case.id);
    expect(refusal.status).toBe(404);
    expect(refusal.body.errorCode).toBe("RESOURCE_NOT_FOUND");
    await csr.context.close();
  });
});

test.describe("messages", () => {
  test("a client sends a message and the CSR sees it", async ({ browser }) => {
    const text = `Hello from the browser test ${Date.now()}`;
    const client = await openAs(browser, "client");
    await client.page.getByRole("button", { name: /^Messages/ }).click();
    const box = client.page.getByLabel("Message to your team");
    await box.fill(text);
    await box.press("Enter");
    await expect(client.page.getByText(text)).toBeVisible();

    const csr = await openAs(browser, "csr");
    await csr.page.getByRole("button", { name: /^Messages/ }).first().click();
    await csr.page.getByRole("button", { name: /Alex Morgan/ }).first().click();
    await expect(csr.page.getByText(text)).toBeVisible();
    await Promise.all([client.context.close(), csr.context.close()]);
  });
});

test.describe("cases", () => {
  test("moving past State Filing in Progress needs the state's filing number", async ({ page }) => {
    await signIn(page, "admin");
    await page.getByRole("button", { name: "Case Management" }).click();
    await page.getByLabel("Search cases").fill("PRJ-119");
    await page.getByRole("button", { name: /Open case PRJ-119/ }).click();
    const confirm = page.getByRole("button", { name: "Confirm stage change" });
    // The next stage, State Approval Received, needs no number...
    await page.getByLabel("Move to stage").selectOption("State Approval Received");
    await expect(page.getByLabel("State filing confirmation no.")).toHaveCount(0);
    await confirm.click();
    await expect(page.getByText("Moved to State Approval Received")).toBeVisible();
    // ...but moving on from it does: the state's confirmation number must be recorded first.
    await page.getByLabel("Move to stage").selectOption("EIN Processing");
    await expect(page.getByLabel("State filing confirmation no.")).toBeVisible();
    await expect(confirm).toBeDisabled();
    await page.getByLabel("State filing confirmation no.").fill("FL-E2E-0001");
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.getByText("Moved to EIN Processing")).toBeVisible();
  });

  test("two people edit the same case: the second is asked to reload", async ({ browser }) => {
    const first = await openAs(browser, "admin");
    const second = await openAs(browser, "manager");
    for (const who of [first, second]) {
      await who.page.goto("/admin/cases/seed-case-118".replace("/admin/", who === first ? "/admin/" : "/manager/"));
      await who.page.getByRole("button", { name: "Edit details" }).click();
    }
    await first.page.getByLabel("Priority").selectOption("Urgent");
    await first.page.getByRole("button", { name: /save/i }).click();
    await expect(first.page.getByText("Case saved")).toBeVisible();

    await second.page.getByLabel("Priority").selectOption("Low");
    await second.page.getByRole("button", { name: /save/i }).click();
    await expect(second.page.getByRole("alertdialog", { name: "This changed while you were editing" })).toBeVisible();
    await second.page.getByRole("button", { name: "Reload" }).click();
    await expect(second.page.getByRole("alertdialog")).toHaveCount(0);
    await Promise.all([first.context.close(), second.context.close()]);
  });
});

test("the audit log records what the browser tests did", async ({ page }) => {
  await signIn(page, "admin");
  await page.getByRole("button", { name: "Audit & Security", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Audit & security" })).toBeVisible();
  await expect(page.getByText("Signed in").first()).toBeVisible();
  void seedPassword;
});
