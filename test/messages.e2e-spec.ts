import { MessagesRepository } from "../src/modules/messages/repository/messages.repository";
import { api, bearerFor, clearStorage, createAppWithMail, FILES, makeCase, makeUser, resetDatabase, storedFiles, type RecordingMail, type TestApp } from "./helpers";
import type request from "supertest";

type User = Awaited<ReturnType<typeof makeUser>>;

function multipart(file: { name: string; data: Buffer; claimedType?: string } | null, fields: Record<string, string>): { contentType: string; body: Buffer } {
  const boundary = "----innovexifymessages7MA4YWxkTrZu0gW";
  const parts: Buffer[] = [];
  for (const [key, value] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
  if (file) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.claimedType ?? "application/octet-stream"}\r\n\r\n`));
    parts.push(file.data, Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { contentType: `multipart/form-data; boundary=${boundary}`, body: Buffer.concat(parts) };
}

function binary(res: request.Response, callback: (error: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  const stream = res as unknown as NodeJS.ReadableStream;
  stream.on("data", (chunk: Buffer) => chunks.push(chunk));
  stream.on("end", () => callback(null, Buffer.concat(chunks)));
}

describe("messages (e2e)", () => {
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
  const send = (who: User, clientId: string, text = "Hello there") => as(who).post(`/api/v1/clients/${clientId}/messages`).send({ text });
  const thread = async (who: User, clientId: string, query = "") => (await as(who).get(`/api/v1/clients/${clientId}/messages${query}`)).body;
  const texts = async (who: User, clientId: string, query = ""): Promise<string[]> => (await thread(who, clientId, query)).data.map((m: { text: string }) => m.text);
  /** Messages straight in the database with exact timestamps, oldest first. */
  async function seed(clientId: string, rows: Array<{ from: User; text: string; at: string; id?: string }>) {
    for (const row of rows) await t.prisma.message.create({ data: { id: row.id, clientId, senderId: row.from.id, text: row.text, createdAt: new Date(row.at) } });
  }

  describe("who can read and write which thread", () => {
    it("lets a client use only their own, and gives 404 for another client's", async () => {
      expect((await send(client1, client1.id, "From Alex")).status).toBe(201);
      expect(await texts(client1, client1.id)).toEqual(["From Alex"]);
      for (const res of [await as(client1).get(`/api/v1/clients/${client2.id}/messages`), await send(client1, client2.id), await as(client1).post(`/api/v1/clients/${client2.id}/messages/read`).send()]) {
        expect(res.status).toBe(404);
        expect(res.body.errorCode).toBe("RESOURCE_NOT_FOUND");
      }
      expect(await t.prisma.message.count({ where: { clientId: client2.id } })).toBe(0);
    });

    it("lets a CSR use only their assigned clients' threads, and gives 404 for another CSR's", async () => {
      expect((await send(csr1, client1.id, "From Cora")).status).toBe(201);
      for (const res of [await as(csr1).get(`/api/v1/clients/${client2.id}/messages`), await send(csr1, client2.id), await as(csr2).get(`/api/v1/clients/${client1.id}/messages`)]) {
        expect(res.status).toBe(404);
      }
      const missing = await as(csr1).get("/api/v1/clients/nobody/messages");
      const outside = await as(csr1).get(`/api/v1/clients/${client2.id}/messages`);
      expect(missing.body.message.replace("nobody", "X")).toBe(outside.body.message.replace(client2.id, "X"));
    });

    it("lets Admin, Manager and Compliance use every thread", async () => {
      for (const who of [admin, manager, compliance]) {
        expect((await send(who, client2.id, `From ${who.role}`)).status).toBe(201);
      }
      expect(await texts(admin, client2.id)).toEqual(["From ADMIN", "From MANAGER", "From COMPLIANCE"]);
    });

    it("requires a signed-in user", async () => {
      expect((await api(t).get(`/api/v1/clients/${client1.id}/messages`)).status).toBe(401);
      expect((await api(t).get("/api/v1/conversations")).status).toBe(401);
      expect((await api(t).get("/api/v1/messages/unread-count")).status).toBe(401);
    });

    it("never offers a way to change or remove a message", async () => {
      const id = (await send(client1, client1.id)).body.data.id as string;
      for (const who of [client1, admin]) {
        for (const res of [
          await as(who).patch(`/api/v1/messages/${id}`).send({ text: "edited" }),
          await as(who).put(`/api/v1/messages/${id}`).send({ text: "edited" }),
          await as(who).delete(`/api/v1/messages/${id}`),
          await as(who).patch(`/api/v1/clients/${client1.id}/messages/${id}`).send({ text: "edited" }),
          await as(who).delete(`/api/v1/clients/${client1.id}/messages/${id}`),
        ]) {
          expect(res.status).toBe(404);
        }
      }
      expect((await t.prisma.message.findUniqueOrThrow({ where: { id } })).text).toBe("Hello there");
    });
  });

  describe("sending", () => {
    it("stores the message with its sender, trims it, and writes an audit entry in the messages category", async () => {
      const res = await send(client1, client1.id, "  Hello, I have a question  ");
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ clientId: client1.id, text: "Hello, I have a question", sender: { id: client1.id, name: "Alex Client", role: "CLIENT" }, mine: true, attachment: null });
      const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { action: "Sent message", category: "messages" } });
      expect(audit).toMatchObject({ actorId: client1.id, ok: true });
      expect(audit.target).toMatch(/^CASE-T-/);
    });

    it("validates the text", async () => {
      expect((await send(client1, client1.id, "   ")).body.errors).toEqual([{ field: "text", message: "Write a message first." }]);
      expect((await as(client1).post(`/api/v1/clients/${client1.id}/messages`).send({})).body.errors).toEqual([{ field: "text", message: "Write a message first." }]);
      expect((await send(client1, client1.id, "t".repeat(5001))).body.errors).toEqual([{ field: "text", message: "A message can't be longer than 5000 characters." }]);
      expect((await send(client1, client1.id, "t".repeat(5000))).status).toBe(201);
      expect((await send(client1, client1.id, "t")).status).toBe(201);
      expect((await as(client1).post(`/api/v1/clients/${client1.id}/messages`).send({ text: "x", extra: 1 })).body.errors[0]).toEqual({ field: "extra", message: "property extra should not exist" });
    });

    it("is read-only for a suspended or removed client's thread, with a specific message", async () => {
      await seed(client1.id, [{ from: client1, text: "Before", at: "2026-01-01T10:00:00.000Z" }]);
      await t.prisma.user.update({ where: { id: client1.id }, data: { status: "SUSPENDED" } });
      const suspended = await send(admin, client1.id, "Are you there?");
      expect(suspended.status).toBe(409);
      expect(suspended.body).toMatchObject({ errorCode: "CONVERSATION_READ_ONLY" });
      expect(suspended.body.message).toBe("Alex Client's account is suspended, so this conversation is read-only. You can still read it; reactivate the account to send messages.");
      expect(await texts(admin, client1.id)).toEqual(["Before"]); // still readable

      await t.prisma.user.update({ where: { id: client1.id }, data: { status: "REMOVED", deletedAt: new Date() } });
      const removed = await send(admin, client1.id, "Hello?");
      expect(removed.body.message).toBe("Alex Client was removed from the portal, so this conversation is read-only and no more messages can be sent.");
      expect(await texts(manager, client1.id)).toEqual(["Before"]); // Admin and Manager can still read it
      expect((await as(csr1).get(`/api/v1/clients/${client1.id}/messages`)).status).toBe(404); // nobody else can
      expect(await t.prisma.message.count({ where: { clientId: client1.id } })).toBe(1);
    });

    it("lets staff write to a client who hasn't accepted their invitation yet", async () => {
      const pending = await makeUser(t.prisma, { email: "pending@test.dev", name: "Pat Pending", role: "CLIENT", status: "INVITED", password: false, csrId: csr1.id });
      expect((await send(csr1, pending.id, "Welcome, here's what happens next")).status).toBe(201);
    });
  });

  describe("attachments", () => {
    const withFile = (who: User, clientId: string, file: { name: string; data: Buffer; claimedType?: string }, text = "See attached") => {
      const { contentType, body } = multipart(file, { text });
      return as(who).post(`/api/v1/clients/${clientId}/messages`).set("Content-Type", contentType).send(body);
    };

    it("lets a client attach a real file, which is stored under a random key and never leaks it", async () => {
      const res = await withFile(client1, client1.id, { name: "bank-statement.pdf", data: FILES.pdf(), claimedType: "application/pdf" });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ text: "See attached", attachment: { name: "bank-statement.pdf", mimeType: "application/pdf", sizeBytes: FILES.pdf().length } });
      expect(await storedFiles(t)).toHaveLength(1);
      const row = await t.prisma.message.findUniqueOrThrow({ where: { id: res.body.data.id } });
      expect(row.attachmentKey).toMatch(/^[0-9a-f-]{36}$/);
      const all = JSON.stringify([res.body, await thread(admin, client1.id), (await as(admin).get("/api/v1/conversations")).body]);
      expect(all).not.toContain(row.attachmentKey as string);
      expect(all).not.toContain("attachmentKey");
    });

    it("lets Admin, Manager and Compliance attach, and refuses a CSR with the rule's message, before anything is stored", async () => {
      for (const who of [admin, manager, compliance]) expect((await withFile(who, client1.id, { name: "a.png", data: FILES.png() })).status).toBe(201);
      await clearStorage(t);
      const refused = await withFile(csr1, client1.id, { name: "a.pdf", data: FILES.pdf() });
      expect(refused.status).toBe(403);
      expect(refused.body.message).toBe("CSRs can't attach files to client conversations.");
      expect(await storedFiles(t)).toHaveLength(0);
      expect((await send(csr1, client1.id, "Text is fine")).status).toBe(201);
    });

    it("applies the same file rules as documents, each with its own code, and stores nothing", async () => {
      const cases: Array<[string, { name: string; data: Buffer; claimedType?: string }, number, string]> = [
        ["a program renamed .pdf", { name: "invoice.pdf", data: FILES.exe(), claimedType: "application/pdf" }, 415, "FILE_CONTENT_NOT_ALLOWED"],
        ["a double extension", { name: "invoice.pdf.exe", data: FILES.exe() }, 415, "FILE_DOUBLE_EXTENSION"],
        ["a type that isn't allowed", { name: "setup.exe", data: FILES.exe() }, 415, "FILE_TYPE_NOT_ALLOWED"],
        ["a mismatch between name and content", { name: "scan.png", data: FILES.jpg() }, 415, "FILE_TYPE_MISMATCH"],
        ["an empty file", { name: "empty.pdf", data: Buffer.alloc(0) }, 422, "FILE_EMPTY"],
      ];
      for (const [, file, status, code] of cases) {
        const res = await withFile(client1, client1.id, file);
        expect([res.status, res.body.errorCode]).toEqual([status, code]);
      }
      expect(await storedFiles(t)).toHaveLength(0);
      expect(await t.prisma.message.count()).toBe(0);
    });

    it("rejects an oversized file naming the limit", async () => {
      const small = await createAppWithMail({ MAX_UPLOAD_MB: "1" });
      try {
        await resetDatabase(small.prisma);
        const owner = await makeUser(small.prisma, { email: "owner@test.dev", role: "CLIENT" });
        const data = Buffer.concat([FILES.pdf(), Buffer.alloc(1_048_576 + 1024)]);
        const { contentType, body } = multipart({ name: "big.pdf", data }, { text: "big" });
        const res = await api(small, bearerFor(small, owner)).post(`/api/v1/clients/${owner.id}/messages`).set("Content-Type", contentType).send(body);
        expect(res.status).toBe(413);
        expect(res.body).toMatchObject({ errorCode: "FILE_TOO_LARGE", message: "That file is larger than 1 MB. Compress it or split it into parts." });
        expect(await small.prisma.message.count()).toBe(0);
      } finally {
        await small.close();
      }
    });

    it("removes the stored file when the database write fails", async () => {
      const spy = jest.spyOn(t.app.get(MessagesRepository), "create").mockRejectedValueOnce(new Error("database went away"));
      try {
        expect((await withFile(client1, client1.id, { name: "a.pdf", data: FILES.pdf() })).status).toBe(500);
      } finally {
        spy.mockRestore();
      }
      expect(await storedFiles(t)).toHaveLength(0);
      expect(await t.prisma.message.count()).toBe(0);
      expect(await t.prisma.notification.count()).toBe(0);
    });

    it("downloads through an authenticated route with the same scoping, nosniff and a safe Content-Disposition", async () => {
      const bytes = FILES.pdf();
      const id = (await withFile(client1, client1.id, { name: "Bank statement (Alex).pdf", data: bytes })).body.data.id as string;
      for (const who of [client1, csr1, admin, manager, compliance]) {
        const res = await as(who).get(`/api/v1/messages/${id}/attachment`).buffer(true).parse(binary);
        expect(res.status).toBe(200);
        expect(Buffer.compare(res.body as Buffer, bytes)).toBe(0);
        expect(res.headers["content-type"]).toBe("application/pdf");
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
        expect(res.headers["content-disposition"]).toBe("attachment; filename=\"Bank statement (Alex).pdf\"; filename*=UTF-8''Bank%20statement%20%28Alex%29.pdf");
        expect(res.headers["cache-control"]).toBe("private, no-store");
      }
      expect(await t.prisma.auditLog.count({ where: { action: "Downloaded message attachment Bank statement (Alex).pdf", category: "messages" } })).toBe(5);

      // Another client or CSR can't tell the message exists.
      for (const who of [client2, csr2]) {
        const res = await as(who).get(`/api/v1/messages/${id}/attachment`);
        expect(res.status).toBe(404);
        expect(res.body.errorCode).toBe("RESOURCE_NOT_FOUND");
      }
      expect((await api(t).get(`/api/v1/messages/${id}/attachment`)).status).toBe(401);
    });

    it("says so when a message has no attachment, and when the file is missing from storage", async () => {
      const plain = (await send(client1, client1.id)).body.data.id as string;
      const none = await as(client1).get(`/api/v1/messages/${plain}/attachment`);
      expect(none.status).toBe(409);
      expect(none.body).toMatchObject({ errorCode: "MESSAGE_HAS_NO_ATTACHMENT", message: "That message has no attachment." });
      const id = (await withFile(client1, client1.id, { name: "a.pdf", data: FILES.pdf() })).body.data.id as string;
      await clearStorage(t);
      expect((await as(client1).get(`/api/v1/messages/${id}/attachment`)).body.errorCode).toBe("STORAGE_FAILED");
    });
  });

  describe("cursor pagination", () => {
    let ids: string[];
    beforeEach(async () => {
      const rows = Array.from({ length: 7 }, (_, i) => ({ from: i % 2 ? csr1 : client1, text: `m${i + 1}`, at: `2026-03-01T10:0${i}:00.000Z`, id: `msg-${i + 1}` }));
      await seed(client1.id, rows);
      ids = rows.map((r) => r.id);
    });

    it("returns the newest page by default, oldest to newest within the page", async () => {
      const page = await thread(csr1, client1.id, "?limit=3");
      expect(page.data.map((m: { text: string }) => m.text)).toEqual(["m5", "m6", "m7"]);
      expect(page.meta).toEqual({ limit: 3, hasMore: true, nextBefore: "msg-5", newest: "msg-7" });
      expect(await texts(csr1, client1.id)).toHaveLength(7); // the default limit (30) covers it
    });

    it("walks back with `before` as an id, until there is nothing older", async () => {
      const second = await thread(csr1, client1.id, "?limit=3&before=msg-5");
      expect(second.data.map((m: { text: string }) => m.text)).toEqual(["m2", "m3", "m4"]);
      expect(second.meta).toEqual({ limit: 3, hasMore: true, nextBefore: "msg-2", newest: "msg-4" });
      const last = await thread(csr1, client1.id, "?limit=3&before=msg-2");
      expect(last.data.map((m: { text: string }) => m.text)).toEqual(["m1"]);
      expect(last.meta).toEqual({ limit: 3, hasMore: false, nextBefore: "msg-1", newest: "msg-1" });
      const none = await thread(csr1, client1.id, "?limit=3&before=msg-1");
      expect(none.data).toEqual([]);
      expect(none.meta).toEqual({ limit: 3, hasMore: false, nextBefore: null, newest: null });
    });

    it("reports hasMore false when the page is exactly the rest", async () => {
      const exact = await thread(csr1, client1.id, "?limit=7");
      expect(exact.meta.hasMore).toBe(false);
      expect((await thread(csr1, client1.id, "?limit=6")).meta.hasMore).toBe(true);
      expect((await thread(csr1, client1.id, "?limit=1")).data.map((m: { text: string }) => m.text)).toEqual(["m7"]);
    });

    it("accepts a timestamp as `before`", async () => {
      expect(await texts(csr1, client1.id, "?before=2026-03-01T10:03:00.000Z")).toEqual(["m1", "m2", "m3"]);
      expect(await texts(csr1, client1.id, "?before=2026-03-01T10:03:00.001Z&limit=2")).toEqual(["m3", "m4"]);
    });

    it("polls for new messages with `since`, by id or timestamp, oldest first", async () => {
      expect(await texts(csr1, client1.id, "?since=msg-5")).toEqual(["m6", "m7"]);
      expect(await texts(csr1, client1.id, "?since=2026-03-01T10:05:00.000Z")).toEqual(["m7"]);
      expect(await texts(csr1, client1.id, "?since=msg-7")).toEqual([]);
      const limited = await thread(csr1, client1.id, "?since=msg-1&limit=2");
      expect(limited.data.map((m: { text: string }) => m.text)).toEqual(["m2", "m3"]);
      expect(limited.meta).toMatchObject({ hasMore: true, newest: "msg-3" });
      await send(client1, client1.id, "m8");
      expect(await texts(csr1, client1.id, "?since=msg-7")).toEqual(["m8"]);
    });

    it("doesn't skip or repeat messages that share a timestamp", async () => {
      await seed(client2.id, ["a", "b", "c", "d"].map((x, i) => ({ from: client2, text: x, at: "2026-04-01T09:00:00.000Z", id: `tie-${i}` })));
      const first = await thread(csr2, client2.id, "?limit=2");
      const second = await thread(csr2, client2.id, `?limit=2&before=${first.meta.nextBefore}`);
      expect([...second.data, ...first.data].map((m: { text: string }) => m.text)).toEqual(["a", "b", "c", "d"]);
      const poll = await thread(csr2, client2.id, "?since=tie-1");
      expect(poll.data.map((m: { text: string }) => m.text)).toEqual(["c", "d"]);
    });

    it("handles an empty thread", async () => {
      const page = await thread(csr2, client2.id);
      expect(page.data).toEqual([]);
      expect(page.meta).toEqual({ limit: 30, hasMore: false, nextBefore: null, newest: null });
    });

    it("rejects bad values with a message on the field, never clamping", async () => {
      const bad = await as(csr1).get(`/api/v1/clients/${client1.id}/messages?limit=101`);
      expect(bad.status).toBe(422);
      expect(bad.body.errors).toEqual([{ field: "limit", message: "limit can't be more than 100. Ask for a smaller page." }]);
      expect((await as(csr1).get(`/api/v1/clients/${client1.id}/messages?limit=0`)).body.errors[0].message).toBe("limit must be 1 or greater.");
      expect((await as(csr1).get(`/api/v1/clients/${client1.id}/messages?limit=abc`)).body.errors[0].field).toBe("limit");
      expect((await as(csr1).get(`/api/v1/clients/${client1.id}/messages?before=a%20b!`)).body.errors[0].field).toBe("before");
      const unknown = await as(csr1).get(`/api/v1/clients/${client1.id}/messages?before=no-such-message`);
      expect(unknown.status).toBe(422);
      expect(unknown.body.errors).toEqual([{ field: "before", message: "before isn't a message in this conversation." }]);
      expect((await as(csr1).get(`/api/v1/clients/${client1.id}/messages?before=2026-13-45T99:00:00Z`)).status).toBe(422);
      const both = await as(csr1).get(`/api/v1/clients/${client1.id}/messages?before=msg-5&since=msg-1`);
      expect(both.body.errors).toEqual([{ field: "since", message: "Use either before (older items) or since (newer items), not both." }]);
      // A message id from another thread isn't a cursor here.
      await seed(client2.id, [{ from: client2, text: "elsewhere", at: "2026-04-01T09:00:00.000Z", id: "other-thread" }]);
      expect((await as(csr1).get(`/api/v1/clients/${client1.id}/messages?before=other-thread`)).status).toBe(422);
      expect(ids).toHaveLength(7);
    });

    it("marks which messages are yours", async () => {
      const page = await thread(client1, client1.id);
      expect(page.data.map((m: { text: string; mine: boolean }) => [m.text, m.mine])).toEqual([["m1", true], ["m2", false], ["m3", true], ["m4", false], ["m5", true], ["m6", false], ["m7", true]]);
    });
  });

  describe("unread counts and read markers", () => {
    beforeEach(async () => {
      await seed(client1.id, [
        { from: client1, text: "c1", at: "2026-03-01T10:00:00.000Z", id: "u1" },
        { from: csr1, text: "s1", at: "2026-03-01T10:01:00.000Z", id: "u2" },
        { from: admin, text: "a1", at: "2026-03-01T10:02:00.000Z", id: "u3" },
        { from: client1, text: "c2", at: "2026-03-01T10:03:00.000Z", id: "u4" },
      ]);
    });
    const unread = async (who: User) => (await as(who).get("/api/v1/messages/unread-count")).body.data.unread as number;
    const conv = async (who: User) => (await as(who).get("/api/v1/conversations")).body.data as Array<{ client: { id: string }; unread: number; lastMessage: { text: string } | null }>;

    it("counts only messages from other people", async () => {
      expect(await unread(csr1)).toBe(3); // c1, a1, c2 (not their own s1)
      expect(await unread(client1)).toBe(2); // s1 and a1
      expect(await unread(admin)).toBe(3); // c1, s1, c2
      expect(await unread(client2)).toBe(0);
      expect(await unread(csr2)).toBe(0); // not their client
    });

    it("marks a thread read up to the newest message, and reading twice is harmless", async () => {
      const first = await as(csr1).post(`/api/v1/clients/${client1.id}/messages/read`).send();
      expect(first.status).toBe(200);
      expect(first.body.data).toMatchObject({ unread: 0, readUpTo: "2026-03-01T10:03:00.000Z" });
      const second = await as(csr1).post(`/api/v1/clients/${client1.id}/messages/read`).send();
      expect(second.body.data).toEqual(first.body.data);
      expect(await t.prisma.conversationRead.count({ where: { userId: csr1.id } })).toBe(1);
      expect(await unread(csr1)).toBe(0);
      // Only the caller's marker moved.
      expect(await unread(admin)).toBe(3);
      expect(await unread(client1)).toBe(2);
    });

    it("counts new messages after the marker, and never moves the marker back", async () => {
      await as(csr1).post(`/api/v1/clients/${client1.id}/messages/read`).send();
      await send(client1, client1.id, "new one");
      expect(await unread(csr1)).toBe(1);
      const marker = (await t.prisma.conversationRead.findFirstOrThrow({ where: { userId: csr1.id } })).readUpTo;
      // An older "read" (a stale tab) can't lower it.
      await t.prisma.$transaction((tx) => t.app.get(MessagesRepository).advanceReadMarker(csr1.id, client1.id, new Date("2026-03-01T10:01:00.000Z"), tx));
      expect((await t.prisma.conversationRead.findFirstOrThrow({ where: { userId: csr1.id } })).readUpTo.getTime()).toBe(marker.getTime());
      expect(await unread(csr1)).toBe(1);
    });

    it("treats your own message as read, and is a no-op on an empty thread", async () => {
      await send(csr1, client1.id, "my reply");
      expect(await unread(csr1)).toBe(0); // sending marks the thread read for the sender
      const empty = await as(csr2).post(`/api/v1/clients/${client2.id}/messages/read`).send();
      expect(empty.status).toBe(200);
      expect(empty.body.data).toEqual({ unread: 0, readUpTo: null });
    });

    it("lists the conversations in scope, unread first, with the last message", async () => {
      await seed(client2.id, [{ from: client2, text: "hi from Bea", at: "2026-03-02T08:00:00.000Z", id: "b1" }]);
      const staff = await conv(admin);
      expect(staff.map((x) => [x.client.id, x.unread, x.lastMessage?.text])).toEqual([[client1.id, 3, "c2"], [client2.id, 1, "hi from Bea"]]);
      expect((await conv(csr1)).map((x) => x.client.id)).toEqual([client1.id]);
      expect((await conv(csr2)).map((x) => x.client.id)).toEqual([client2.id]);
      expect((await conv(client1)).map((x) => [x.client.id, x.unread])).toEqual([[client1.id, 2]]);
      await as(admin).post(`/api/v1/clients/${client1.id}/messages/read`).send();
      expect((await conv(admin)).map((x) => [x.client.id, x.unread])).toEqual([[client2.id, 1], [client1.id, 0]]);
      for (const who of [compliance, manager]) expect(await conv(who)).toHaveLength(2);
    });

    it("lists a client with no messages yet, flags read-only threads and pages the list", async () => {
      const quiet = await makeUser(t.prisma, { email: "quiet@test.dev", name: "Quinn Quiet", role: "CLIENT", csrId: csr1.id });
      await t.prisma.user.update({ where: { id: client2.id }, data: { status: "SUSPENDED" } });
      const rows = await conv(admin);
      expect(rows.map((x) => x.client.id)).toContain(quiet.id);
      expect(rows.find((x) => x.client.id === quiet.id)).toMatchObject({ lastMessage: null, unread: 0 });
      const suspended = (await as(admin).get("/api/v1/conversations")).body.data.find((x: { client: { id: string } }) => x.client.id === client2.id);
      expect(suspended.writable).toBe(false);
      const page = await as(admin).get("/api/v1/conversations?limit=2&page=2");
      expect(page.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
      expect((await as(admin).get("/api/v1/conversations?page=0&limit=101")).body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["limit", "page"]);
    });
  });

  describe("notifications", () => {
    it("tells the client's team when a client writes, but not the sender, and tells the client when staff write", async () => {
      await send(client1, client1.id, "Question");
      for (const who of [admin, manager, compliance, csr1]) expect(await t.prisma.notification.count({ where: { userId: who.id, text: "New message from Alex Client", link: "messages" } })).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: { in: [csr2.id, client1.id, client2.id] } } })).toBe(0);
      expect(t.mail.sent.filter((m) => m.kind === "notification").map((m) => m.to).sort()).toEqual(["admin@test.dev", "comp@test.dev", "csr1@test.dev", "manager@test.dev"]);

      await t.prisma.notification.deleteMany();
      t.mail.sent = [];
      await send(csr1, client1.id, "Answer");
      expect(await t.prisma.notification.findMany({ where: { userId: client1.id }, select: { text: true, link: true } })).toEqual([{ text: "New message from Cora CSR (CSR)", link: "cmsgs" }]);
      expect(t.mail.sent.map((m) => m.to)).toEqual(["client1@test.dev"]);
    });

    it("follows each person's MESSAGES preferences: in-app and email are separate", async () => {
      await t.prisma.notificationPreference.create({ data: { userId: csr1.id, category: "MESSAGES", inApp: false, email: true } });
      await t.prisma.notificationPreference.create({ data: { userId: admin.id, category: "MESSAGES", inApp: true, email: false } });
      await send(client1, client1.id, "Question");
      expect(await t.prisma.notification.count({ where: { userId: csr1.id } })).toBe(0);
      expect(await t.prisma.notification.count({ where: { userId: admin.id } })).toBe(1);
      const to = t.mail.sent.filter((m) => m.kind === "notification").map((m) => m.to);
      expect(to).toContain("csr1@test.dev");
      expect(to).not.toContain("admin@test.dev");
    });

    it("still sends the message when the email can't be sent after the commit", async () => {
      t.mail.failWith = new Error("SMTP is down");
      expect((await send(client1, client1.id, "Question")).status).toBe(201);
      expect(await t.prisma.message.count()).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: csr1.id } })).toBe(1);
    });
  });

  describe("rate limit", () => {
    it("limits how fast one person can send, with a specific message, and doesn't affect anyone else", async () => {
      const limited = await createAppWithMail({ MESSAGE_RATE_LIMIT_PER_MIN: "3" });
      try {
        await resetDatabase(limited.prisma);
        const a = await makeUser(limited.prisma, { email: "a@test.dev", name: "Alice", role: "CLIENT" });
        const b = await makeUser(limited.prisma, { email: "b@test.dev", name: "Bob", role: "CLIENT" });
        const post = (who: User, text: string) => api(limited, bearerFor(limited, who)).post(`/api/v1/clients/${who.id}/messages`).send({ text });
        for (const n of [1, 2, 3]) expect((await post(a, `m${n}`)).status).toBe(201);
        const blocked = await post(a, "m4");
        expect(blocked.status).toBe(429);
        expect(blocked.body.errorCode).toBe("TOO_MANY_REQUESTS");
        expect(blocked.body.message).toMatch(/^You're sending messages too quickly: the limit is 3 per minute\. Wait \d+ seconds? and try again\.$/);
        expect(await limited.prisma.message.count({ where: { clientId: a.id } })).toBe(3);
        expect((await post(b, "hello")).status).toBe(201);
        // Reading isn't limited.
        expect((await api(limited, bearerFor(limited, a)).get(`/api/v1/clients/${a.id}/messages`)).status).toBe(200);
      } finally {
        await limited.close();
      }
    });
  });
});
