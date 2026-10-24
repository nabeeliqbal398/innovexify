import fs from "node:fs";

import { expect, test, type Browser } from "@playwright/test";

import { openAs, pdfFile, pngFile, watchCsp } from "./helpers";

/** Compliance asks Alex Morgan for a document; returns Alex's page, ready to upload, and Compliance's page. */
async function requestFromClient(browser: Browser, name: string) {
  const compliance = await openAs(browser, "compliance");
  await compliance.page.getByRole("button", { name: "Document Requests" }).click();
  const clientSelect = compliance.page.getByLabel("Client", { exact: true });
  await expect(clientSelect.locator("option", { hasText: "Alex Morgan" })).toHaveCount(1);
  await clientSelect.selectOption((await clientSelect.locator("option", { hasText: "Alex Morgan" }).getAttribute("value")) as string);
  await compliance.page.getByLabel("Document name").fill(name);
  await compliance.page.getByRole("button", { name: "Request from client" }).click();
  await expect(compliance.page.getByText(new RegExp(name.replace(/[()]/g, "\\$&"))).first()).toBeVisible();

  const client = await openAs(browser, "client");
  await client.page.getByRole("button", { name: /Documents/ }).first().click();
  return { compliance, client };
}

test.describe("uploads, end to end", () => {
  test("a client uploads a PDF; Compliance previews it in the page and downloads exactly the bytes that were sent", async ({ browser }) => {
    const name = "Lease agreement (E2E)";
    const file = pdfFile("Lease.pdf");
    const { compliance, client } = await requestFromClient(browser, name);
    const csp = await watchCsp(compliance.page);

    await client.page.getByLabel(`Upload ${name}`).setInputFiles(file);
    await expect(client.page.getByText(`${name} uploaded for review`)).toBeVisible();
    await expect(client.page.getByText("Lease.pdf")).toBeVisible();

    // The reviewer's queue shows it with the real file name.
    await compliance.page.reload();
    await compliance.page.getByRole("button", { name: /^Document Review/ }).click();
    const row = compliance.page.locator('[id^="doc-"]').filter({ hasText: `“${name}”` });
    await expect(row).toBeVisible();
    await expect(row.getByText("Lease.pdf")).toBeVisible();

    // The preview opens the file in a frame, under the page's policy.
    await row.getByRole("button", { name: "Preview" }).click();
    const frame = compliance.page.locator(`iframe[title="Preview of ${name}"]`);
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute("src", /^blob:/);

    // The download is byte-for-byte the upload.
    const [download] = await Promise.all([compliance.page.waitForEvent("download"), compliance.page.getByRole("button", { name: "Download" }).first().click()]);
    expect(download.suggestedFilename()).toBe("Lease.pdf");
    const saved = await download.path();
    expect(Buffer.compare(fs.readFileSync(saved), file.buffer)).toBe(0);

    expect(await csp.violations()).toEqual([]);
    await Promise.all([compliance.context.close(), client.context.close()]);
  });

  test("an image is previewed as an image, and the client sees it waiting for review", async ({ browser }) => {
    const name = "Photo ID (E2E)";
    const { compliance, client } = await requestFromClient(browser, name);
    const csp = await watchCsp(compliance.page);

    await client.page.getByLabel(`Upload ${name}`).setInputFiles(pngFile("Photo ID.png"));
    await expect(client.page.getByText(`${name} uploaded for review`)).toBeVisible();

    await compliance.page.reload();
    await compliance.page.getByRole("button", { name: /^Document Review/ }).click();
    const row = compliance.page.locator('[id^="doc-"]').filter({ hasText: `“${name}”` });
    await row.getByRole("button", { name: "Preview" }).click();
    const image = compliance.page.getByRole("img", { name });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0); // it really decoded
    expect(await csp.violations()).toEqual([]);
    await Promise.all([compliance.context.close(), client.context.close()]);
  });

  test("a file that is not what it claims to be is refused by the server and nothing is stored", async ({ browser }) => {
    const name = "Bank letter (E2E)";
    const { compliance, client } = await requestFromClient(browser, name);
    await client.page.getByLabel(`Upload ${name}`).setInputFiles({ name: "letter.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ this is a program, not a PDF") });
    await expect(client.page.getByRole("alert").first()).toContainText(/PDF|type|content|file/i);
    await compliance.page.reload();
    await compliance.page.getByRole("button", { name: /^Document Review/ }).click();
    await expect(compliance.page.locator('[id^="doc-"]').filter({ hasText: `“${name}”` })).toHaveCount(0); // never reached the review queue
    await Promise.all([compliance.context.close(), client.context.close()]);
  });
});
