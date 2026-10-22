/* eslint-disable no-control-regex -- asserting that no control character survives in a stored name */
import type request from "supertest";

import { DocumentsRepository } from "../src/modules/documents/repository/documents.repository";
import { StorageService } from "../src/common/storage/storage.service";
import { VirusScanner } from "../src/common/storage/virus-scanner";
import {
  api,
  bearerFor,
  clearStorage,
  createAppWithMail,
  FILES,
  makeCase,
  makeDocument,
  makeUser,
  resetDatabase,
  storedFiles,
  type RecordingMail,
  type TestApp,
} from "./helpers";

type User = Awaited<ReturnType<typeof makeUser>>;
type Doc = Awaited<ReturnType<typeof makeDocument>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A multipart body built by hand, so a test can send any file name and any claimed content type exactly as written.
 * (Client libraries tidy file names before sending; an attacker's client doesn't.)
 */
function multipart(file: { name: string; data: Buffer; claimedType?: string; field?: string } | null, fields: Record<string, string> = {}): { contentType: string; body: Buffer } {
  const boundary = "----innovexifytest7MA4YWxkTrZu0gW";
  const parts: Buffer[] = [];
  for (const [key, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
  }
  if (file) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field ?? "file"}"; filename="${file.name}"\r\nContent-Type: ${file.claimedType ?? "application/octet-stream"}\r\n\r\n`));
    parts.push(file.data, Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { contentType: `multipart/form-data; boundary=${boundary}`, body: Buffer.concat(parts) };
}

describe("documents (e2e)", () => {
  let t: TestApp & { mail: RecordingMail };

  beforeAll(async () => {
    t = await createAppWithMail();
  });
  afterAll(async () => {
    await t.close();
  });

  let admin: User;
  let manager: User;
  let csr1: User;
  let csr2: User;
  let compliance: User;
  let client1: User; // csr1's
  let client2: User; // csr2's

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await clearStorage(t);
    t.mail.sent = [];
    t.mail.failWith = null;
    admin = await makeUser(t.prisma, { email: "admin@test.dev", name: "Ada Admin", role: "ADMIN" });
    manager = await makeUser(t.prisma, { email: "manager@test.dev", name: "Max Manager", role: "MANAGER" });
    csr1 = await makeUser(t.prisma, { email: "csr1@test.dev", name: "Cora CSR", role: "CSR" });
    csr2 = await makeUser(t.prisma, { email: "csr2@test.dev", name: "Carl CSR", role: "CSR" });
    compliance = await makeUser(t.prisma, { email: "comp@test.dev", name: "Cleo Compliance", role: "COMPLIANCE" });
    client1 = await makeUser(t.prisma, { email: "client1@test.dev", name: "Alex Client", role: "CLIENT", csrId: csr1.id });
    client2 = await makeUser(t.prisma, { email: "client2@test.dev", name: "Bea Client", role: "CLIENT", csrId: csr2.id });
    await makeCase(t.prisma, { clientId: client1.id });
  });

  const as = (user: { id: string; role: Parameters<typeof bearerFor>[1]["role"] }) => api(t, bearerFor(t, user));
  const upload = (who: User, id: string, name: string, data: Buffer, claimedType?: string, field?: string) => {
    const { contentType, body } = multipart({ name, data, claimedType, field });
    return as(who).post(`/api/v1/documents/${id}/upload`).set("Content-Type", contentType).send(body);
  };
  const share = (who: User, clientId: string, file: { name: string; data: Buffer } | null, name?: string) => {
    const { contentType, body } = multipart(file, { clientId, ...(name ? { name } : {}) });
    return as(who).post("/api/v1/documents/share").set("Content-Type", contentType).send(body);
  };
  const review = (who: User, id: string, decision: string, reason?: string) => as(who).post(`/api/v1/documents/${id}/review`).send({ decision, ...(reason === undefined ? {} : { reason }) });
  const statusOf = async (id: string) => (await t.prisma.document.findUniqueOrThrow({ where: { id } })).status;
  const ids = async (who: User, query = ""): Promise<string[]> => (await as(who).get(`/api/v1/documents${query}`)).body.data.map((d: { id: string }) => d.id);

  /** A document that has a real file behind it, as if the client had uploaded it. */
  async function withFile(client: User, status: Doc["status"], name = "Passport", fileName = "passport.pdf", data = FILES.pdf()): Promise<Doc> {
    const storage = t.app.get(StorageService);
    const key = crypto.randomUUID();
    await storage.put(key, data);
    return makeDocument(t.prisma, { clientId: client.id, name, status, fileName, storageKey: key, mimeType: "application/pdf", requestedById: compliance.id });
  }

  describe("requesting a document", () => {
    it("lets Admin, Manager and Compliance request one, notifies the client and records history", async () => {
      const res = await as(compliance).post("/api/v1/documents/request").send({ clientId: client1.id, name: "Proof of address", type: "ADDRESS", note: "A utility bill from the last 3 months" });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        name: "Proof of address",
        type: "ADDRESS",
        status: "REQUESTED",
        note: "A utility bill from the last 3 months",
        client: { id: client1.id, name: "Alex Client" },
        requestedBy: { id: compliance.id },
        history: [{ status: "REQUESTED", note: "A utility bill from the last 3 months", by: { id: compliance.id } }],
      });
      expect(await t.prisma.notification.count({ where: { userId: client1.id, text: "Document requested: Proof of address", link: "cdocs" } })).toBe(1);
      expect(t.mail.sent.filter((m) => m.kind === "notification").map((m) => m.to)).toEqual(["client1@test.dev"]);
      expect(await t.prisma.auditLog.count({ where: { action: "Requested document: Proof of address", category: "docs", actorId: compliance.id } })).toBe(1);
      for (const who of [admin, manager]) {
        expect((await as(who).post("/api/v1/documents/request").send({ clientId: client2.id, name: `Passport for ${who.role}` })).status).toBe(201);
      }
    });

    it("refuses a CSR and a client, with the rule's message", async () => {
      for (const who of [csr1, client1]) {
        const res = await as(who).post("/api/v1/documents/request").send({ clientId: client1.id, name: "Passport" });
        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Only Admin, Manager and Compliance can upload or request client documents.");
      }
      expect(await t.prisma.document.count()).toBe(0);
    });

    it("blocks a request that repeats an open one for the same client, naming the existing request", async () => {
      await as(manager).post("/api/v1/documents/request").send({ clientId: client1.id, name: "Proof of address (utility bill)" });
      const dup = await as(compliance).post("/api/v1/documents/request").send({ clientId: client1.id, name: "Please upload proof of address" });
      expect(dup.status).toBe(409);
      expect(dup.body.errorCode).toBe("DUPLICATE_DOCUMENT_REQUEST");
      expect(dup.body.message).toBe('"Proof of address (utility bill)" is already requested from this client and is still open in Documents. Follow up on that request instead of requesting it again.');
      expect(await t.prisma.document.count()).toBe(1);

      // Another client may be asked; and once the first is approved, it is no longer open.
      expect((await as(compliance).post("/api/v1/documents/request").send({ clientId: client2.id, name: "Proof of address" })).status).toBe(201);
      await t.prisma.document.updateMany({ where: { clientId: client1.id }, data: { status: "APPROVED" } });
      expect((await as(compliance).post("/api/v1/documents/request").send({ clientId: client1.id, name: "Proof of address" })).status).toBe(201);
    });

    it("treats rejected and 'more information' documents as still open", async () => {
      for (const status of ["REJECTED", "INFO"] as const) {
        await resetDatabaseKeepingUsers();
        await makeDocument(t.prisma, { clientId: client1.id, name: "Operating agreement", status });
        const res = await as(compliance).post("/api/v1/documents/request").send({ clientId: client1.id, name: "Upload the operating agreement" });
        expect(res.body.errorCode).toBe("DUPLICATE_DOCUMENT_REQUEST");
      }
    });

    async function resetDatabaseKeepingUsers(): Promise<void> {
      await t.prisma.documentEvent.deleteMany();
      await t.prisma.document.deleteMany();
    }

    it("validates the fields, and a client who is outside the caller's scope or removed", async () => {
      const res = await as(compliance).post("/api/v1/documents/request").send({ name: "x".repeat(201), type: "SECRET", note: "n".repeat(501) });
      expect(res.status).toBe(422);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          { field: "clientId", message: "Choose a client." },
          { field: "name", message: "The document name can't be longer than 200 characters." },
          { field: "type", message: expect.stringContaining("type must be one of") },
          { field: "note", message: "The note can't be longer than 500 characters." },
        ]),
      );
      expect((await as(compliance).post("/api/v1/documents/request").send({ clientId: client1.id, name: "   " })).body.errors[0]).toEqual({ field: "name", message: "Enter a document name." });
      expect((await as(compliance).post("/api/v1/documents/request").send({ clientId: "nobody", name: "Passport" })).status).toBe(404);
      await t.prisma.user.update({ where: { id: client2.id }, data: { status: "REMOVED", deletedAt: new Date() } });
      expect((await as(admin).post("/api/v1/documents/request").send({ clientId: client2.id, name: "Passport" })).body.errorCode).toBe("USER_REMOVED");
    });
  });

  describe("the status machine", () => {
    const ALL = ["REQUESTED", "SUBMITTED", "APPROVED", "REJECTED", "INFO", "SHARED"] as const;
    const LABEL: Record<string, string> = { REQUESTED: "Requested", SUBMITTED: "Submitted", APPROVED: "Approved", REJECTED: "Rejected", INFO: "More information needed", SHARED: "Shared" };

    describe("client upload", () => {
      it.each(["REQUESTED", "REJECTED", "INFO"] as const)("allows an upload from %s, which becomes SUBMITTED", async (from) => {
        const doc = await makeDocument(t.prisma, { clientId: client1.id, status: from, reason: from === "REQUESTED" ? "" : "Please send a clearer scan" });
        const res = await upload(client1, doc.id, "scan.pdf", FILES.pdf());
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ status: "SUBMITTED", fileName: "scan.pdf", reason: "" });
        expect(await statusOf(doc.id)).toBe("SUBMITTED");
        expect(await storedFiles(t)).toHaveLength(1);
      });

      it.each(["SUBMITTED", "APPROVED", "SHARED"] as const)("refuses an upload from %s, naming the current and target status", async (from) => {
        const doc = await makeDocument(t.prisma, { clientId: client1.id, status: from });
        const res = await upload(client1, doc.id, "scan.pdf", FILES.pdf());
        expect(res.status).toBe(409);
        expect(res.body.errorCode).toBe("INVALID_STATE_TRANSITION");
        expect(res.body.message).toContain(`A document can't move from "${LABEL[from]}" to "Submitted".`);
        expect(await statusOf(doc.id)).toBe(from);
        expect(await storedFiles(t)).toHaveLength(0);
      });
    });

    describe("staff review", () => {
      it.each([
        ["APPROVED", undefined],
        ["REJECTED", "The passport photo is cut off"],
        ["INFO", "Which of the two addresses is current?"],
      ] as const)("allows %s from SUBMITTED", async (decision, reason) => {
        const doc = await withFile(client1, "SUBMITTED");
        const res = await review(compliance, doc.id, decision, reason);
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe(decision);
        expect(res.body.data.reason).toBe(reason ?? "");
        expect(await statusOf(doc.id)).toBe(decision);
      });

      const invalid = ALL.filter((s) => s !== "SUBMITTED").flatMap((from) => (["APPROVED", "REJECTED", "INFO"] as const).map((to) => [from, to] as const));
      it.each(invalid)("refuses a review of a %s document as %s, naming both", async (from, to) => {
        const doc = await makeDocument(t.prisma, { clientId: client1.id, status: from });
        const res = await review(compliance, doc.id, to, "Some reason");
        expect(res.status).toBe(409);
        expect(res.body.errorCode).toBe("INVALID_STATE_TRANSITION");
        expect(res.body.message).toContain(`A document can't move from "${LABEL[from]}" to "${LABEL[to]}".`);
        expect(await statusOf(doc.id)).toBe(from);
        expect(await t.prisma.documentEvent.count({ where: { documentId: doc.id } })).toBe(0);
      });

      it("explains why, in words, for the common mistakes", async () => {
        const requested = await makeDocument(t.prisma, { clientId: client1.id, status: "REQUESTED" });
        expect((await review(compliance, requested.id, "APPROVED")).body.message).toContain("The client hasn't submitted a file yet.");
        const approved = await makeDocument(t.prisma, { clientId: client1.id, status: "APPROVED" });
        expect((await review(compliance, approved.id, "REJECTED", "Changed my mind")).body.message).toContain("It was already approved.");
        const shared = await makeDocument(t.prisma, { clientId: client1.id, status: "SHARED" });
        expect((await review(compliance, shared.id, "APPROVED")).body.message).toContain("A shared document is a finished file from the team");
      });
    });

    it("walks the whole life of a document, with a history entry for every step", async () => {
      const requested = await as(compliance).post("/api/v1/documents/request").send({ clientId: client1.id, name: "Passport", type: "IDENTITY" });
      const id = requested.body.data.id as string;
      expect((await upload(client1, id, "passport.pdf", FILES.pdf())).body.data.status).toBe("SUBMITTED");
      expect((await review(compliance, id, "REJECTED", "Photo is cut off")).body.data.status).toBe("REJECTED");
      expect((await upload(client1, id, "passport-2.pdf", FILES.pdf())).body.data.status).toBe("SUBMITTED");
      expect((await review(manager, id, "INFO", "Is this the current passport?")).body.data.status).toBe("INFO");
      expect((await upload(client1, id, "passport-3.pdf", FILES.pdf())).body.data.status).toBe("SUBMITTED");
      const approved = await review(admin, id, "APPROVED");
      expect(approved.body.data).toMatchObject({ status: "APPROVED", reason: "", fileName: "passport-3.pdf" });

      const detail = await as(admin).get(`/api/v1/documents/${id}`);
      expect(detail.body.data.history.map((h: { status: string }) => h.status)).toEqual(["REQUESTED", "SUBMITTED", "REJECTED", "SUBMITTED", "INFO", "SUBMITTED", "APPROVED"]);
      expect(detail.body.data.history.map((h: { by: { name: string } }) => h.by.name)).toEqual(["Cleo Compliance", "Alex Client", "Cleo Compliance", "Alex Client", "Max Manager", "Alex Client", "Ada Admin"]);
      // Each replaced file was removed: one file is left, the one the document points at.
      expect(await storedFiles(t)).toHaveLength(1);
    });
  });

  describe("review rules", () => {
    it("requires a reason for reject and for more information, with its own code and a client-facing message", async () => {
      const a = await withFile(client1, "SUBMITTED");
      for (const [decision, text] of [
        ["REJECTED", "Add the reason this document is being rejected. The client will see it."],
        ["INFO", "Say what extra information you need. The client will see it."],
      ] as const) {
        for (const reason of [undefined, "", "   "]) {
          const res = await review(compliance, a.id, decision, reason);
          expect(res.status).toBe(422);
          expect(res.body).toMatchObject({ errorCode: "DOCUMENT_REASON_REQUIRED", message: text, errors: [{ field: "reason", message: "Add a reason the client will see." }] });
        }
      }
      expect(await statusOf(a.id)).toBe("SUBMITTED");
      expect((await review(compliance, a.id, "APPROVED")).status).toBe(200);
    });

    it("notifies the client in the prototype's words, and clears the reason on approval", async () => {
      const a = await withFile(client1, "SUBMITTED", "Passport");
      await review(compliance, a.id, "REJECTED", "Photo is cut off");
      expect(await t.prisma.notification.count({ where: { userId: client1.id, text: "“Passport” needs a correction: Photo is cut off", link: "cdocs" } })).toBe(1);
      const b = await withFile(client1, "SUBMITTED", "Proof of address");
      await review(compliance, b.id, "INFO", "Which address is current?");
      expect(await t.prisma.notification.count({ where: { userId: client1.id, text: "“Proof of address” needs more information: Which address is current?" } })).toBe(1);
      const c = await withFile(client1, "SUBMITTED", "EIN letter");
      await review(compliance, c.id, "APPROVED");
      expect(await t.prisma.notification.count({ where: { userId: client1.id, text: "“EIN letter” was approved" } })).toBe(1);
      expect((await t.prisma.document.findUniqueOrThrow({ where: { id: c.id } })).reason).toBe("");
      expect(await t.prisma.auditLog.count({ where: { category: "docs", action: { in: ["Rejected Passport", "Requested more information on Proof of address", "Approved EIN letter"] } } })).toBe(3);
      expect(t.mail.sent.filter((m) => m.kind === "notification")).toHaveLength(3);
    });

    it("lets only Admin, Manager and Compliance review: a client and a CSR can't, and the refusal is audited", async () => {
      const doc = await withFile(client1, "SUBMITTED");
      for (const who of [client1, csr1]) {
        const res = await review(who, doc.id, "APPROVED");
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ errorCode: "PERMISSION_DENIED", message: "Only Admin, Manager and Compliance can review documents." });
      }
      expect(await statusOf(doc.id)).toBe("SUBMITTED");
      expect(await t.prisma.auditLog.count({ where: { action: { startsWith: "Refused: docsReview" }, ok: false, category: "docs" } })).toBe(2);
      for (const who of [admin, manager, compliance]) {
        const d = await withFile(client1, "SUBMITTED");
        expect((await review(who, d.id, "APPROVED")).status).toBe(200);
      }
    });

    it("validates the decision", async () => {
      const doc = await withFile(client1, "SUBMITTED");
      const res = await review(compliance, doc.id, "MAYBE");
      expect(res.status).toBe(422);
      expect(res.body.errors).toEqual([{ field: "decision", message: "decision must be APPROVED, REJECTED or INFO (more information needed)." }]);
      expect((await review(compliance, doc.id, "REJECTED", "r".repeat(1001))).body.errors[0].message).toBe("The reason can't be longer than 1000 characters.");
    });

    it("lets only one of two simultaneous reviews win", async () => {
      const doc = await withFile(client1, "SUBMITTED");
      const [a, b] = await Promise.all([review(compliance, doc.id, "APPROVED"), review(manager, doc.id, "REJECTED", "Unreadable")]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect((a.status === 409 ? a : b).body.errorCode).toBe("INVALID_STATE_TRANSITION");
      expect(await t.prisma.documentEvent.count({ where: { documentId: doc.id } })).toBe(1);
    });
  });

  describe("sharing a finished document", () => {
    it("stores it, shows it to the client at once, and notifies them", async () => {
      const res = await share(compliance, client1.id, { name: "Certificate of Formation.pdf", data: FILES.pdf() }, "Your certificate");
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ name: "Your certificate", status: "SHARED", type: "OTHER", fileName: "Certificate of Formation.pdf", mimeType: "application/pdf" });
      expect(await storedFiles(t)).toHaveLength(1);
      expect(await t.prisma.notification.count({ where: { userId: client1.id, text: "New document shared with you: Your certificate" } })).toBe(1);
      expect(await t.prisma.auditLog.count({ where: { action: "Shared document Certificate of Formation.pdf", category: "docs" } })).toBe(1);

      const mine = await as(client1).get(`/api/v1/documents/${res.body.data.id}`);
      expect(mine.status).toBe(200);
      const download = await as(client1).get(`/api/v1/documents/${res.body.data.id}/download`).buffer(true).parse(binary);
      expect(download.status).toBe(200);
      expect(Buffer.compare(download.body as Buffer, FILES.pdf())).toBe(0);
    });

    it("names the document after the file when no name is given", async () => {
      const res = await share(manager, client2.id, { name: "Operating Agreement.docx", data: FILES.docx() });
      expect(res.body.data.name).toBe("Operating Agreement.docx");
    });

    it("refuses a CSR and a client, a missing file, and a client outside the caller's scope, storing nothing", async () => {
      expect((await share(csr1, client1.id, { name: "a.pdf", data: FILES.pdf() })).status).toBe(403);
      expect((await share(client1, client1.id, { name: "a.pdf", data: FILES.pdf() })).status).toBe(403);
      const none = await share(compliance, client1.id, null);
      expect(none.status).toBe(422);
      expect(none.body).toMatchObject({ errorCode: "FILE_REQUIRED", message: "Choose a file to upload." });
      expect((await share(compliance, "nobody", { name: "a.pdf", data: FILES.pdf() })).status).toBe(404);
      expect((await share(compliance, client1.id, { name: "a.pdf.exe", data: FILES.exe() })).status).toBe(415);
      expect(await storedFiles(t)).toHaveLength(0);
      expect(await t.prisma.document.count()).toBe(0);
    });

    it("can't be uploaded over or reviewed: it is a finished file", async () => {
      const shared = (await share(compliance, client1.id, { name: "a.pdf", data: FILES.pdf() })).body.data.id as string;
      expect((await upload(client1, shared, "b.pdf", FILES.pdf())).body.errorCode).toBe("INVALID_STATE_TRANSITION");
      expect((await review(compliance, shared, "APPROVED")).status).toBe(409);
    });
  });

  describe("who may upload", () => {
    it("lets only the client upload against a request, and only their own", async () => {
      const doc = await makeDocument(t.prisma, { clientId: client1.id });
      for (const who of [compliance, admin, manager]) {
        const res = await upload(who, doc.id, "a.pdf", FILES.pdf());
        expect(res.status).toBe(403);
        expect(res.body.errorCode).toBe("DOCUMENT_UPLOAD_NOT_ALLOWED");
        expect(res.body.message).toBe("Only the client can upload a file against a request. To send a finished document to a client, use Share.");
      }
      const other = await upload(client2, doc.id, "a.pdf", FILES.pdf());
      expect(other.status).toBe(404);
      expect((await upload(csr1, doc.id, "a.pdf", FILES.pdf())).status).toBe(403);
      expect(await statusOf(doc.id)).toBe("REQUESTED");
      expect(await storedFiles(t)).toHaveLength(0);
    });

    it("notifies Admin, Manager and Compliance when a client submits", async () => {
      const doc = await makeDocument(t.prisma, { clientId: client1.id, name: "Passport" });
      await upload(client1, doc.id, "passport.pdf", FILES.pdf());
      for (const who of [admin, manager, compliance]) {
        expect(await t.prisma.notification.count({ where: { userId: who.id, text: "Alex Client submitted “Passport” for review", link: "documents" } })).toBe(1);
      }
      expect(await t.prisma.notification.count({ where: { userId: { in: [csr1.id, csr2.id] } } })).toBe(0);
      expect(await t.prisma.auditLog.count({ where: { action: "Uploaded passport.pdf", actorId: client1.id, category: "docs" } })).toBe(1);
    });
  });

  describe("upload rules", () => {
    let doc: Doc;
    beforeEach(async () => {
      doc = await makeDocument(t.prisma, { clientId: client1.id });
    });
    const expectRefused = async (res: { status: number; body: { errorCode: string; message: string } }, status: number, code: string) => {
      expect(res.status).toBe(status);
      expect(res.body.errorCode).toBe(code);
      // Nothing was stored, and the document is exactly as it was.
      expect(await storedFiles(t)).toHaveLength(0);
      expect(await t.prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).toMatchObject({ status: "REQUESTED", storageKey: null, fileName: "" });
    };

    it.each([
      ["a PDF", "contract.pdf", () => FILES.pdf(), "application/pdf"],
      ["a PNG", "logo.png", () => FILES.png(), "image/png"],
      ["a JPG", "photo.jpg", () => FILES.jpg(), "image/jpeg"],
      ["a JPEG", "photo.jpeg", () => FILES.jpg(), "image/jpeg"],
      ["a DOCX", "agreement.docx", () => FILES.docx(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ])("accepts a real %s", async (_label, name, data, mime) => {
      const res = await upload(client1, doc.id, name, data());
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: "SUBMITTED", fileName: name, mimeType: mime, sizeBytes: data().length });
    });

    it("rejects a program renamed to .pdf, even when the sender says it is a PDF", async () => {
      const res = await upload(client1, doc.id, "invoice.pdf", FILES.exe(), "application/pdf");
      await expectRefused(res, 415, "FILE_CONTENT_NOT_ALLOWED");
      expect(res.body.message).toBe('The contents of "invoice.pdf" aren\'t a PDF, PNG, JPG or DOCX file, whatever its name says. It was not accepted.');
    });

    it("ignores the content type the sender claims: a real PDF sent as image/png is still a PDF", async () => {
      const res = await upload(client1, doc.id, "real.pdf", FILES.pdf(), "image/png");
      expect(res.status).toBe(200);
      expect(res.body.data.mimeType).toBe("application/pdf");
    });

    it("rejects an empty file", async () => {
      const res = await upload(client1, doc.id, "empty.pdf", Buffer.alloc(0));
      await expectRefused(res, 422, "FILE_EMPTY");
      expect(res.body.message).toBe('"empty.pdf" is empty (0 bytes). Check the file and choose it again.');
    });

    it("rejects a double extension, whichever way round", async () => {
      for (const name of ["passport.pdf.exe", "invoice.exe.pdf", "photo.jpg.js", "scan.pdf.pdf"]) {
        const res = await upload(client1, doc.id, name, name.endsWith(".exe") ? FILES.exe() : FILES.pdf());
        await expectRefused(res, 415, "FILE_DOUBLE_EXTENSION");
        expect(res.body.message).toContain("more than one file extension");
      }
    });

    it("rejects an extension that isn't allowed, and a file with no extension", async () => {
      const exe = await upload(client1, doc.id, "setup.exe", FILES.exe());
      await expectRefused(exe, 415, "FILE_TYPE_NOT_ALLOWED");
      expect(exe.body.message).toBe("That file type isn't accepted (.exe). Use PDF, PNG, JPG or DOCX.");
      await expectRefused(await upload(client1, doc.id, "README", FILES.pdf()), 415, "FILE_TYPE_NOT_ALLOWED");
      await expectRefused(await upload(client1, doc.id, "notes.txt", Buffer.from("hello")), 415, "FILE_TYPE_NOT_ALLOWED");
    });

    it("rejects a real file whose type doesn't match its extension", async () => {
      const res = await upload(client1, doc.id, "scan.png", FILES.jpg());
      await expectRefused(res, 415, "FILE_TYPE_MISMATCH");
      expect(res.body.message).toBe('"scan.png" is named as a .png file but its contents are a JPEG image. Save it in the right format, or rename it, and upload it again.');
      await expectRefused(await upload(client1, doc.id, "contract.docx", FILES.pdf()), 415, "FILE_TYPE_MISMATCH");
    });

    it("rejects a plain ZIP renamed .docx, and HTML renamed to an image", async () => {
      const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("readme.txt"), Buffer.alloc(16)]);
      await expectRefused(await upload(client1, doc.id, "report.docx", zip), 415, "FILE_CONTENT_NOT_ALLOWED");
      await expectRefused(await upload(client1, doc.id, "logo.png", Buffer.from("<html><script>alert(1)</script></html>")), 415, "FILE_CONTENT_NOT_ALLOWED");
    });

    it("neutralises a path in the file name: only the bare name is kept and the file lands under a random key", async () => {
      for (const name of ["../../../etc/passwd.pdf", "..\\..\\windows\\system32\\evil.pdf", "/abs/olute/cv.pdf"]) {
        await clearStorage(t);
        await t.prisma.document.update({ where: { id: doc.id }, data: { status: "REQUESTED", storageKey: null, fileName: "" } });
        const res = await upload(client1, doc.id, name, FILES.pdf());
        expect(res.status).toBe(200);
        expect(res.body.data.fileName).toMatch(/^(passwd|evil|cv)\.pdf$/);
        expect(res.body.data.fileName).not.toMatch(/[\\/]/);
        const files = await storedFiles(t);
        expect(files).toHaveLength(1);
        // Under the storage root, in a two-letter folder, named by a UUID: nothing of the sender's name is on disk.
        const root = (t.app.get(StorageService) as unknown as { root: string }).root;
        expect(files[0].startsWith(root)).toBe(true);
        expect(files[0].slice(root.length + 1).split(/[\\/]/)).toHaveLength(2);
        expect(files[0].split(/[\\/]/).pop()).toMatch(UUID);
      }
    });

    it("strips control characters from the name", async () => {
      const res = await upload(client1, doc.id, "pass	port scan.pdf", FILES.pdf());
      expect(res.status).toBe(200);
      expect(res.body.data.fileName).not.toMatch(/[ -]/);
      expect(res.body.data.fileName.endsWith(".pdf")).toBe(true);
    });

    it("keeps no more than 255 characters of a long name, and its extension", async () => {
      const res = await upload(client1, doc.id, `${"x".repeat(400)}.pdf`, FILES.pdf());
      expect(res.status).toBe(200);
      expect(res.body.data.fileName).toHaveLength(255);
      expect(res.body.data.fileName.endsWith(".pdf")).toBe(true);
    });

    it("never reveals the storage key, in any response", async () => {
      const up = await upload(client1, doc.id, "passport.pdf", FILES.pdf());
      const stored = (await t.prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).storageKey as string;
      expect(stored).toMatch(UUID);
      const everything = JSON.stringify([
        up.body,
        (await as(admin).get(`/api/v1/documents/${doc.id}`)).body,
        (await as(admin).get("/api/v1/documents")).body,
        (await as(client1).get(`/api/v1/documents/${doc.id}`)).body,
        (await as(csr1).get("/api/v1/documents")).body,
      ]);
      expect(everything).not.toContain(stored);
      expect(everything).not.toContain("storageKey");
    });

    it("requires a file, in the field named 'file'", async () => {
      const { contentType, body } = multipart(null);
      const none = await as(client1).post(`/api/v1/documents/${doc.id}/upload`).set("Content-Type", contentType).send(body);
      await expectRefused(none, 422, "FILE_REQUIRED");
      await expectRefused(await upload(client1, doc.id, "a.pdf", FILES.pdf(), undefined, "attachment"), 422, "FILE_REQUIRED");
      const json = await as(client1).post(`/api/v1/documents/${doc.id}/upload`).send({});
      await expectRefused(json, 422, "FILE_REQUIRED");
    });

    it("stops a file that fails the virus scan before anything is stored", async () => {
      const scanner = t.app.get(VirusScanner);
      const spy = jest.spyOn(scanner, "scan").mockResolvedValueOnce({ clean: false, reason: "Eicar-Test-Signature" });
      try {
        const res = await upload(client1, doc.id, "clean-looking.pdf", FILES.pdf());
        await expectRefused(res, 422, "FILE_REJECTED_BY_SCAN");
        expect(res.body.message).toContain("blocked by the security scan (Eicar-Test-Signature)");
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }
    });

    it("refuses to accept an upload when the scanner itself fails", async () => {
      const spy = jest.spyOn(t.app.get(VirusScanner), "scan").mockRejectedValueOnce(new Error("scanner offline"));
      try {
        const res = await upload(client1, doc.id, "a.pdf", FILES.pdf());
        expect(res.status).toBe(500);
        expect(await storedFiles(t)).toHaveLength(0);
        expect(await statusOf(doc.id)).toBe("REQUESTED");
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("file size", () => {
    it("rejects a file over MAX_UPLOAD_MB with a message that names the limit, and accepts one at the limit", async () => {
      const small = await createAppWithMail({ MAX_UPLOAD_MB: "1" });
      try {
        await resetDatabase(small.prisma);
        const owner = await makeUser(small.prisma, { email: "owner@test.dev", role: "CLIENT" });
        const doc = await makeDocument(small.prisma, { clientId: owner.id });
        const send = (size: number) => {
          const data = Buffer.concat([FILES.pdf(), Buffer.alloc(size - FILES.pdf().length)]);
          const { contentType, body } = multipart({ name: "big.pdf", data });
          return api(small, bearerFor(small, owner)).post(`/api/v1/documents/${doc.id}/upload`).set("Content-Type", contentType).send(body);
        };
        const tooBig = await send(1_048_576 + 1024);
        expect(tooBig.status).toBe(413);
        expect(tooBig.body).toMatchObject({ errorCode: "FILE_TOO_LARGE", message: "That file is larger than 1 MB. Compress it or split it into parts." });
        expect((await small.prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe("REQUESTED");
        expect((await send(1_048_576)).status).toBe(200);
      } finally {
        await small.close();
      }
    });
  });

  describe("files and the database stay in step", () => {
    it("deletes the stored file when the database write fails after it was stored", async () => {
      const doc = await makeDocument(t.prisma, { clientId: client1.id });
      const repo = t.app.get(DocumentsRepository);
      const spy = jest.spyOn(repo, "addEvent").mockRejectedValueOnce(new Error("database went away"));
      try {
        const res = await upload(client1, doc.id, "passport.pdf", FILES.pdf());
        expect(res.status).toBe(500);
      } finally {
        spy.mockRestore();
      }
      expect(await storedFiles(t)).toHaveLength(0); // the file that was written is gone
      // And the transaction rolled back: the document is untouched.
      expect(await t.prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).toMatchObject({ status: "REQUESTED", storageKey: null, fileName: "" });
      expect(await t.prisma.documentEvent.count()).toBe(0);
    });

    it("keeps the previous file when a re-upload's database write fails, and removes only the new one", async () => {
      const doc = await withFile(client1, "REJECTED", "Passport", "old.pdf");
      expect(await storedFiles(t)).toHaveLength(1);
      const spy = jest.spyOn(t.app.get(DocumentsRepository), "addEvent").mockRejectedValueOnce(new Error("database went away"));
      try {
        expect((await upload(client1, doc.id, "new.pdf", FILES.pdf())).status).toBe(500);
      } finally {
        spy.mockRestore();
      }
      expect(await storedFiles(t)).toHaveLength(1);
      const row = await t.prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
      expect(row).toMatchObject({ status: "REJECTED", fileName: "old.pdf" });
      const download = await as(admin).get(`/api/v1/documents/${doc.id}/download`).buffer(true).parse(binary);
      expect(download.status).toBe(200);
    });

    it("deletes the stored file when sharing fails in the database", async () => {
      const spy = jest.spyOn(t.app.get(DocumentsRepository), "create").mockRejectedValueOnce(new Error("database went away"));
      try {
        expect((await share(compliance, client1.id, { name: "a.pdf", data: FILES.pdf() })).status).toBe(500);
      } finally {
        spy.mockRestore();
      }
      expect(await storedFiles(t)).toHaveLength(0);
      expect(await t.prisma.document.count()).toBe(0);
    });

    it("writes nothing to the database when storing the file fails", async () => {
      const doc = await makeDocument(t.prisma, { clientId: client1.id });
      const spy = jest.spyOn(t.app.get(StorageService), "put").mockRejectedValueOnce(new Error("disk full"));
      try {
        const res = await upload(client1, doc.id, "passport.pdf", FILES.pdf());
        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({ errorCode: "STORAGE_FAILED", message: "We couldn't save the file, so nothing was changed. Try again, and if it keeps happening, tell your administrator." });
      } finally {
        spy.mockRestore();
      }
      expect(await t.prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).toMatchObject({ status: "REQUESTED", storageKey: null });
      expect(await t.prisma.documentEvent.count()).toBe(0);
      expect(await t.prisma.notification.count()).toBe(0);
      expect(await storedFiles(t)).toHaveLength(0);

      const shareSpy = jest.spyOn(t.app.get(StorageService), "put").mockRejectedValueOnce(new Error("disk full"));
      try {
        expect((await share(compliance, client1.id, { name: "a.pdf", data: FILES.pdf() })).status).toBe(503);
      } finally {
        shareSpy.mockRestore();
      }
      expect(await t.prisma.document.count()).toBe(1); // only the original request
    });

    it("leaves exactly one file when two uploads race", async () => {
      const doc = await makeDocument(t.prisma, { clientId: client1.id });
      const [a, b] = await Promise.all([upload(client1, doc.id, "first.pdf", FILES.pdf()), upload(client1, doc.id, "second.pdf", FILES.png().length ? FILES.pdf() : FILES.pdf())]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(await storedFiles(t)).toHaveLength(1);
      expect(await t.prisma.documentEvent.count({ where: { documentId: doc.id } })).toBe(1);
    });

    it("deletes nothing when a document is soft-deleted: the record and the file are kept", async () => {
      const doc = await withFile(client1, "APPROVED");
      expect((await as(manager).delete(`/api/v1/documents/${doc.id}`)).status).toBe(200);
      expect(await storedFiles(t)).toHaveLength(1);
      expect((await t.prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).deletedAt).not.toBeNull();
    });
  });

  describe("download", () => {
    it("streams the exact bytes with safe headers, and audits the download", async () => {
      const bytes = FILES.pdf();
      const doc = await withFile(client1, "APPROVED", "Passport", "Passport (Alex Morgan).pdf", bytes);
      const res = await as(client1).get(`/api/v1/documents/${doc.id}/download`).buffer(true).parse(binary);
      expect(res.status).toBe(200);
      expect(Buffer.compare(res.body as Buffer, bytes)).toBe(0);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-disposition"]).toBe("attachment; filename=\"Passport (Alex Morgan).pdf\"; filename*=UTF-8''Passport%20%28Alex%20Morgan%29.pdf");
      expect(res.headers["content-length"]).toBe(String(bytes.length));
      expect(res.headers["cache-control"]).toBe("private, no-store");
      expect(await t.prisma.auditLog.count({ where: { action: "Downloaded Passport (Alex Morgan).pdf", actorId: client1.id, category: "docs", ok: true } })).toBe(1);
    });

    it("builds Content-Disposition from the sanitised name, so a hostile name can't inject a header or a path", async () => {
      const doc = await withFile(client1, "APPROVED", "Odd", 'a"b;cé.pdf');
      const res = await as(admin).get(`/api/v1/documents/${doc.id}/download`).buffer(true).parse(binary);
      const header = res.headers["content-disposition"] as string;
      expect(header).toBe("attachment; filename=\"a_b_c_.pdf\"; filename*=UTF-8''a%22b%3Bc%C3%A9.pdf");
      expect(header).not.toMatch(/[\r\n]/);
      expect(res.headers["content-type"]).toBe("application/pdf");
    });

    it("serves an image or Word file with its own detected type, never as HTML", async () => {
      const png = await withFile(client1, "APPROVED", "Logo", "logo.png", FILES.png());
      await t.prisma.document.update({ where: { id: png.id }, data: { mimeType: "image/png" } });
      const res = await as(admin).get(`/api/v1/documents/${png.id}/download`).buffer(true).parse(binary);
      expect(res.headers["content-type"]).toBe("image/png");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-disposition"]).toMatch(/^attachment;/);
    });

    it("gives another client's document a 404, not a 403", async () => {
      const doc = await withFile(client1, "APPROVED");
      const res = await as(client2).get(`/api/v1/documents/${doc.id}/download`);
      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe("RESOURCE_NOT_FOUND");
      expect(JSON.stringify(res.body)).not.toContain("passport");
      expect((await as(client2).get(`/api/v1/documents/${doc.id}`)).status).toBe(404);
      const missing = await as(client2).get("/api/v1/documents/does-not-exist/download");
      expect(missing.body.message.replace("does-not-exist", "X")).toBe(res.body.message.replace(doc.id, "X"));
    });

    it("refuses a CSR who may see the document exist but not open it, and audits the refusal as the prototype did", async () => {
      const doc = await withFile(client1, "APPROVED", "Passport", "Passport (Alex Client).pdf");
      const res = await as(csr1).get(`/api/v1/documents/${doc.id}/download`);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        errorCode: "PERMISSION_DENIED",
        message: "CSRs can't open, preview, download or upload client documents, by any route. You can still see whether a document is required, awaiting review, approved or needs a correction.",
      });
      const row = await t.prisma.auditLog.findFirstOrThrow({ where: { action: "Refused: Download Passport (Alex Client).pdf (Alex Client)" } });
      expect(row).toMatchObject({ ok: false, category: "docs", actorId: csr1.id, actorRole: "CSR" });
      expect(row.target).toMatch(/^CASE-T-/);
      // The bytes were not sent, and a refusal is not a download.
      expect(await t.prisma.auditLog.count({ where: { action: { startsWith: "Downloaded" } } })).toBe(0);
    });

    it("gives a CSR 404 for a document of another CSR's client, with no audit row for a file they can't know exists", async () => {
      const doc = await withFile(client2, "APPROVED");
      const res = await as(csr1).get(`/api/v1/documents/${doc.id}/download`);
      expect(res.status).toBe(404);
      expect(await t.prisma.auditLog.count({ where: { category: "docs", ok: false } })).toBe(0);
    });

    it("lets Admin, Manager and Compliance download any client's document", async () => {
      const doc = await withFile(client2, "SUBMITTED");
      for (const who of [admin, manager, compliance]) {
        const res = await as(who).get(`/api/v1/documents/${doc.id}/download`).buffer(true).parse(binary);
        expect(res.status).toBe(200);
      }
      expect(await t.prisma.auditLog.count({ where: { action: { startsWith: "Downloaded" } } })).toBe(3);
    });

    it("tells you when there is no file yet, and when the file has gone missing from storage", async () => {
      const requested = await makeDocument(t.prisma, { clientId: client1.id, name: "Passport" });
      const none = await as(client1).get(`/api/v1/documents/${requested.id}/download`);
      expect(none.status).toBe(409);
      expect(none.body).toMatchObject({ errorCode: "DOCUMENT_HAS_NO_FILE", message: 'There is no file on "Passport" yet: the client hasn\'t uploaded one.' });

      const doc = await withFile(client1, "APPROVED");
      await clearStorage(t);
      const gone = await as(client1).get(`/api/v1/documents/${doc.id}/download`);
      expect(gone.status).toBe(503);
      expect(gone.body.errorCode).toBe("STORAGE_FAILED");
      expect(await t.prisma.auditLog.count({ where: { action: { startsWith: "Downloaded" } } })).toBe(0);
    });

    it("requires a signed-in user and has no public route to the files", async () => {
      const doc = await withFile(client1, "APPROVED");
      expect((await api(t).get(`/api/v1/documents/${doc.id}/download`)).status).toBe(401);
      for (const url of ["/storage", "/uploads", "/files", "/api/v1/storage", "/api/v1/files/x", "/public"]) {
        expect([401, 404]).toContain((await api(t).get(url)).status);
      }
    });
  });

  describe("who sees what", () => {
    let d1: Doc;
    let d2: Doc;
    beforeEach(async () => {
      d1 = await withFile(client1, "REJECTED", "Passport", "secret-passport.pdf");
      await t.prisma.document.update({ where: { id: d1.id }, data: { reason: "Photo is cut off", note: "Colour scan please", reviewedById: compliance.id } });
      await t.prisma.documentEvent.create({ data: { documentId: d1.id, status: "REJECTED", byId: compliance.id, note: "Photo is cut off" } });
      d2 = await withFile(client2, "APPROVED", "Proof of address", "bill.pdf");
    });

    it("shows a client only their own documents, and never staff-only fields", async () => {
      expect(await ids(client1)).toEqual([d1.id]);
      const res = await as(client1).get(`/api/v1/documents/${d1.id}`);
      expect(res.body.data).toMatchObject({ id: d1.id, name: "Passport", status: "REJECTED", fileName: "secret-passport.pdf", reason: "Photo is cut off", note: "Colour scan please" });
      for (const staffOnly of ["requestedBy", "reviewedBy", "client", "deletedAt"]) expect(res.body.data).not.toHaveProperty(staffOnly);
      expect(res.body.data.history).toEqual([{ id: expect.any(String), status: "REJECTED", note: "Photo is cut off", at: expect.any(String) }]);
      expect(JSON.stringify(res.body)).not.toContain("Cleo Compliance");
    });

    it("shows a CSR whether a document is required, waiting, approved or needs a correction, and nothing of its content", async () => {
      expect(await ids(csr1)).toEqual([d1.id]);
      const res = await as(csr1).get(`/api/v1/documents/${d1.id}`);
      expect(res.body.data).toMatchObject({ id: d1.id, name: "Passport", status: "REJECTED", client: { id: client1.id, name: "Alex Client" } });
      for (const hidden of ["fileName", "mimeType", "sizeBytes", "reason", "note", "history", "requestedBy", "reviewedBy"]) expect(res.body.data).not.toHaveProperty(hidden);
      expect(JSON.stringify(res.body)).not.toContain("secret-passport");
      expect(JSON.stringify(res.body)).not.toContain("Photo is cut off");
      expect((await as(csr1).get(`/api/v1/documents/${d2.id}`)).status).toBe(404);
      // And they can't use search to find out a file name they may not see.
      expect(await ids(csr1, "?search=secret-passport")).toEqual([]);
    });

    it("shows Admin, Manager and Compliance everything except the storage key", async () => {
      for (const who of [admin, manager, compliance]) {
        expect((await ids(who)).sort()).toEqual([d1.id, d2.id].sort());
      }
      const res = await as(compliance).get(`/api/v1/documents/${d1.id}`);
      expect(res.body.data).toMatchObject({
        fileName: "secret-passport.pdf",
        reason: "Photo is cut off",
        requestedBy: { name: "Cleo Compliance" },
        reviewedBy: { name: "Cleo Compliance" },
        client: { name: "Alex Client" },
        history: [{ status: "REJECTED", by: { name: "Cleo Compliance" } }],
      });
      expect(await ids(admin, "?search=secret-passport")).toEqual([d1.id]);
    });

    it("filters by client, status and type, searches, sorts and paginates", async () => {
      await makeDocument(t.prisma, { clientId: client1.id, name: "EIN letter", status: "SUBMITTED" });
      await t.prisma.document.update({ where: { id: d1.id }, data: { type: "IDENTITY" } });
      expect(await ids(admin, `?clientId=${client2.id}`)).toEqual([d2.id]);
      expect(await ids(admin, "?status=APPROVED")).toEqual([d2.id]);
      expect(await ids(admin, "?type=IDENTITY")).toEqual([d1.id]);
      expect(await ids(admin, "?search=bea")).toEqual([d2.id]);
      expect(await ids(admin, "?search=proof")).toEqual([d2.id]);
      const byName = (await as(admin).get("/api/v1/documents?sort=name&order=asc")).body.data.map((d: { name: string }) => d.name);
      expect(byName).toEqual(["EIN letter", "Passport", "Proof of address"]);
      const page = await as(admin).get("/api/v1/documents?limit=2&page=2&sort=name");
      expect(page.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
      const bad = await as(admin).get("/api/v1/documents?page=0&limit=101&status=GONE");
      expect(bad.status).toBe(422);
      expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["limit", "page", "status"]);
      const sort = await as(admin).get("/api/v1/documents?sort=storageKey");
      expect(sort.status).toBe(422);
      expect(sort.body.errors).toEqual([{ field: "sort", message: "You can sort by requestedAt, name, status, type, submittedAt." }]);
    });

    it("requires a signed-in user", async () => {
      expect((await api(t).get("/api/v1/documents")).status).toBe(401);
    });
  });

  describe("deleting", () => {
    it("is a soft delete for Admin and Manager only", async () => {
      const doc = await withFile(client1, "APPROVED");
      for (const who of [compliance, csr1, client1]) {
        const res = await as(who).delete(`/api/v1/documents/${doc.id}`);
        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Only Admin and Manager can delete documents. They are kept for the record and hidden from everyone else.");
      }
      const res = await as(manager).delete(`/api/v1/documents/${doc.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.deletedAt).not.toBeNull();
      expect(await t.prisma.auditLog.count({ where: { action: "Deleted document Passport", actorId: manager.id, category: "docs" } })).toBe(1);

      // Hidden from everyone else; Admin and Manager can still open it (read-only).
      for (const who of [client1, csr1, compliance]) {
        expect((await as(who).get(`/api/v1/documents/${doc.id}`)).status).toBe(404);
        expect(await ids(who)).toEqual([]);
      }
      expect(await ids(admin)).toEqual([]);
      expect((await as(admin).get(`/api/v1/documents/${doc.id}`)).body.data.deletedAt).not.toBeNull();
    });

    it("refuses to change or delete a deleted document again", async () => {
      const doc = await withFile(client1, "SUBMITTED");
      await as(admin).delete(`/api/v1/documents/${doc.id}`);
      const again = await as(admin).delete(`/api/v1/documents/${doc.id}`);
      expect(again.status).toBe(409);
      expect(again.body).toMatchObject({ errorCode: "DOCUMENT_DELETED", message: '"Passport" was deleted, so it is read-only.' });
      expect((await review(compliance, doc.id, "APPROVED")).status).toBe(404); // Compliance can no longer see it
      expect((await review(admin, doc.id, "APPROVED")).body.errorCode).toBe("DOCUMENT_DELETED");
    });

    it("hides the documents of a client who was removed", async () => {
      const doc = await withFile(client1, "APPROVED");
      await t.prisma.user.update({ where: { id: client1.id }, data: { status: "REMOVED", deletedAt: new Date() } });
      expect(await ids(compliance)).toEqual([]);
      expect((await as(compliance).get(`/api/v1/documents/${doc.id}`)).status).toBe(404);
    });
  });
});

/** Collects a response body as raw bytes (supertest would otherwise try to read it as text). */
function binary(res: request.Response, callback: (error: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  const stream = res as unknown as NodeJS.ReadableStream;
  stream.on("data", (chunk: Buffer) => chunks.push(chunk));
  stream.on("end", () => callback(null, Buffer.concat(chunks)));
}
