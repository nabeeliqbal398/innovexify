import { api, bearerFor, createAppWithMail, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

type User = Awaited<ReturnType<typeof makeUser>>;

describe("notifications (e2e)", () => {
  let t: TestApp & { mail: RecordingMail };

  beforeAll(async () => {
    t = await createAppWithMail();
  });
  afterAll(async () => {
    await t.close();
  });

  let ada: User;
  let max: User;
  let alex: User;

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    ada = await makeUser(t.prisma, { email: "admin@test.dev", name: "Ada Admin", role: "ADMIN" });
    max = await makeUser(t.prisma, { email: "manager@test.dev", name: "Max Manager", role: "MANAGER" });
    alex = await makeUser(t.prisma, { email: "client1@test.dev", name: "Alex Client", role: "CLIENT" });
  });

  const as = (user: { id: string; role: Parameters<typeof bearerFor>[1]["role"] }) => api(t, bearerFor(t, user));
  const note = (user: User, text: string, at: string, extra: Record<string, unknown> = {}) =>
    t.prisma.notification.create({ data: { userId: user.id, text, link: "tickets", createdAt: new Date(at), ...extra } });
  const texts = async (who: User, query = ""): Promise<string[]> => (await as(who).get(`/api/v1/notifications${query}`)).body.data.map((n: { text: string }) => n.text);

  describe("ownership", () => {
    it("lists only your own, newest first", async () => {
      await note(ada, "Ada 1", "2026-05-01T10:00:00.000Z");
      await note(ada, "Ada 2", "2026-05-02T10:00:00.000Z");
      await note(max, "Max 1", "2026-05-01T12:00:00.000Z");
      expect(await texts(ada)).toEqual(["Ada 2", "Ada 1"]);
      expect(await texts(max)).toEqual(["Max 1"]);
      expect(await texts(alex)).toEqual([]);
    });

    it("gives 404, not 403, for someone else's notification on every route, and changes nothing", async () => {
      const theirs = await note(max, "Max's private one", "2026-05-01T10:00:00.000Z");
      for (const res of [await as(ada).post(`/api/v1/notifications/${theirs.id}/read`).send(), await as(ada).delete(`/api/v1/notifications/${theirs.id}`)]) {
        expect(res.status).toBe(404);
        expect(res.body.errorCode).toBe("RESOURCE_NOT_FOUND");
      }
      const missing = await as(ada).post("/api/v1/notifications/does-not-exist/read").send();
      expect(missing.status).toBe(404);
      expect(missing.body.message.replace("does-not-exist", "X")).toBe((await as(ada).post(`/api/v1/notifications/${theirs.id}/read`).send()).body.message.replace(theirs.id, "X"));
      expect(await t.prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ readAt: null, text: "Max's private one" });
    });

    it("never marks or deletes anyone else's through read-all", async () => {
      await note(ada, "Mine", "2026-05-01T10:00:00.000Z");
      await note(max, "Theirs", "2026-05-01T10:00:00.000Z");
      const res = await as(ada).post("/api/v1/notifications/read-all").send();
      expect(res.body.data).toEqual({ updated: 1 });
      expect(await t.prisma.notification.count({ where: { userId: max.id, readAt: null } })).toBe(1);
    });

    it("requires a signed-in user", async () => {
      expect((await api(t).get("/api/v1/notifications")).status).toBe(401);
      expect((await api(t).post("/api/v1/notifications/read-all").send()).status).toBe(401);
    });
  });

  describe("reading and deleting", () => {
    it("marks one read, keeps the first reading time, and counts the unread", async () => {
      const first = await note(ada, "One", "2026-05-01T10:00:00.000Z");
      await note(ada, "Two", "2026-05-02T10:00:00.000Z");
      expect((await as(ada).get("/api/v1/notifications/unread-count")).body.data).toEqual({ unread: 2 });
      const read = await as(ada).post(`/api/v1/notifications/${first.id}/read`).send();
      expect(read.status).toBe(200);
      expect(read.body.data).toMatchObject({ id: first.id, read: true });
      const when = read.body.data.readAt as string;
      const again = await as(ada).post(`/api/v1/notifications/${first.id}/read`).send();
      expect(again.body.data.readAt).toBe(when);
      expect((await as(ada).get("/api/v1/notifications/unread-count")).body.data).toEqual({ unread: 1 });
    });

    it("filters unread ones, and marks everything read in one go", async () => {
      await note(ada, "Read already", "2026-05-01T10:00:00.000Z", { readAt: new Date() });
      await note(ada, "Unread 1", "2026-05-02T10:00:00.000Z");
      await note(ada, "Unread 2", "2026-05-03T10:00:00.000Z");
      expect(await texts(ada, "?unread=true")).toEqual(["Unread 2", "Unread 1"]);
      expect((await as(ada).post("/api/v1/notifications/read-all").send()).body.data).toEqual({ updated: 2 });
      expect(await texts(ada, "?unread=true")).toEqual([]);
      expect((await as(ada).post("/api/v1/notifications/read-all").send()).body.data).toEqual({ updated: 0 });
      expect((await as(ada).get("/api/v1/notifications?unread=maybe")).body.errors[0]).toEqual({ field: "unread", message: "unread must be true or false." });
    });

    it("deletes your own", async () => {
      const mine = await note(ada, "Delete me", "2026-05-01T10:00:00.000Z");
      expect((await as(ada).delete(`/api/v1/notifications/${mine.id}`)).status).toBe(200);
      expect(await t.prisma.notification.count()).toBe(0);
      expect((await as(ada).delete(`/api/v1/notifications/${mine.id}`)).status).toBe(404);
    });
  });

  describe("links", () => {
    it("only ever returns a view name, never a URL", async () => {
      await note(ada, "Good link", "2026-05-05T10:00:00.000Z", { link: "documents" });
      await note(ada, "Evil absolute", "2026-05-04T10:00:00.000Z", { link: "https://evil.example/phish" });
      await note(ada, "Evil protocol-relative", "2026-05-03T10:00:00.000Z", { link: "//evil.example" });
      await note(ada, "Script", "2026-05-02T10:00:00.000Z", { link: "javascript:alert(1)" });
      await note(ada, "Unknown view", "2026-05-01T10:00:00.000Z", { link: "not-a-view" });
      const rows = (await as(ada).get("/api/v1/notifications")).body.data as Array<{ text: string; link: string }>;
      expect(rows.map((r) => [r.text, r.link])).toEqual([["Good link", "documents"], ["Evil absolute", ""], ["Evil protocol-relative", ""], ["Script", ""], ["Unknown view", ""]]);
    });

    it("stores only a view name when the application writes one", async () => {
      const client = await makeUser(t.prisma, { email: "c@test.dev", name: "C", role: "CLIENT", csrId: ada.id });
      await as(ada).post(`/api/v1/clients/${client.id}/messages`).send({ text: "hello" });
      const stored = await t.prisma.notification.findMany({ where: { userId: client.id } });
      expect(stored.map((n) => n.link)).toEqual(["cmsgs"]);
    });
  });

  describe("pagination by cursor", () => {
    beforeEach(async () => {
      for (let i = 1; i <= 5; i++) await note(ada, `n${i}`, `2026-05-0${i}T10:00:00.000Z`, { id: `note-${i}` });
    });

    it("walks back from the newest with `before`, by id or timestamp", async () => {
      const first = (await as(ada).get("/api/v1/notifications?limit=2")).body;
      expect(first.data.map((n: { text: string }) => n.text)).toEqual(["n5", "n4"]);
      expect(first.meta).toEqual({ limit: 2, hasMore: true, nextBefore: "note-4", newest: "note-5" });
      expect(await texts(ada, "?limit=2&before=note-4")).toEqual(["n3", "n2"]);
      const last = (await as(ada).get("/api/v1/notifications?limit=2&before=note-2")).body;
      expect(last.data.map((n: { text: string }) => n.text)).toEqual(["n1"]);
      expect(last.meta.hasMore).toBe(false);
      expect(await texts(ada, "?before=2026-05-03T10:00:00.000Z")).toEqual(["n2", "n1"]);
    });

    it("polls for new ones with `since`, still newest first", async () => {
      expect(await texts(ada, "?since=note-3")).toEqual(["n5", "n4"]);
      expect(await texts(ada, "?since=note-5")).toEqual([]);
    });

    it("rejects bad cursors with a message on the field, and another person's id as a cursor", async () => {
      expect((await as(ada).get("/api/v1/notifications?limit=101")).body.errors).toEqual([{ field: "limit", message: "limit can't be more than 100. Ask for a smaller page." }]);
      expect((await as(ada).get("/api/v1/notifications?before=a%20b")).body.errors[0].field).toBe("before");
      await note(max, "Max's", "2026-05-01T10:00:00.000Z", { id: "maxs-note" });
      const foreign = await as(ada).get("/api/v1/notifications?before=maxs-note");
      expect(foreign.status).toBe(422);
      expect(foreign.body.errors).toEqual([{ field: "before", message: "before isn't one of your notifications." }]);
      expect((await as(ada).get("/api/v1/notifications?before=note-3&since=note-1")).body.errors[0].field).toBe("since");
    });
  });
});
