import { api, bearerFor, createAppWithMail, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

type User = Awaited<ReturnType<typeof makeUser>>;

describe("audit (e2e)", () => {
  let t: TestApp & { mail: RecordingMail };

  beforeAll(async () => {
    t = await createAppWithMail();
  });
  afterAll(async () => {
    await t.close();
  });

  let ada: User;
  let max: User;
  let sam: User;
  let alex: User;

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    ada = await makeUser(t.prisma, { email: "admin@test.dev", name: "Ada Admin", role: "ADMIN" });
    max = await makeUser(t.prisma, { email: "manager@test.dev", name: "Max Manager", role: "MANAGER" });
    sam = await makeUser(t.prisma, { email: "csr@test.dev", name: "Sam Csr", role: "CSR" });
    alex = await makeUser(t.prisma, { email: "client1@test.dev", name: "Alex Client", role: "CLIENT" });
  });

  const as = (user: { id: string; role: Parameters<typeof bearerFor>[1]["role"] }) => api(t, bearerFor(t, user));
  const entry = (data: { action: string; target?: string; category: string; ok?: boolean; actorId?: string; at: string }) =>
    t.prisma.auditLog.create({ data: { action: data.action, target: data.target ?? "x", category: data.category, ok: data.ok ?? true, actorId: data.actorId ?? ada.id, actorRole: "ADMIN", createdAt: new Date(data.at) } });
  const actions = async (query = ""): Promise<string[]> => (await as(ada).get(`/api/v1/audit${query}`)).body.data.map((a: { action: string }) => a.action);

  describe("access", () => {
    it("is for the Admin only; the others are refused and a client cannot see it", async () => {
      expect((await as(ada).get("/api/v1/audit")).status).toBe(200);
      for (const who of [max, sam, alex]) {
        for (const path of ["/api/v1/audit", "/api/v1/audit/export"]) {
          const res = await as(who).get(path);
          expect(res.status).toBe(403);
        }
      }
      expect((await api(t).get("/api/v1/audit")).status).toBe(401);
    });
  });

  describe("listing", () => {
    beforeEach(async () => {
      await entry({ action: "Created case", category: "cases", at: "2026-05-01T10:00:00.000Z" });
      await entry({ action: "Uploaded document", category: "docs", at: "2026-05-02T10:00:00.000Z", actorId: max.id });
      await entry({ action: "Tried to delete a user", category: "users", ok: false, at: "2026-05-03T10:00:00.000Z" });
    });

    it("is newest first and filters by actor, category, result, dates and search", async () => {
      expect(await actions()).toEqual(["Tried to delete a user", "Uploaded document", "Created case"]);
      expect(await actions(`?actorId=${max.id}`)).toEqual(["Uploaded document"]);
      expect(await actions("?category=cases")).toEqual(["Created case"]);
      expect(await actions("?category=refused")).toEqual(["Tried to delete a user"]);
      expect(await actions("?ok=false")).toEqual(["Tried to delete a user"]);
      expect(await actions("?from=2026-05-02&to=2026-05-02")).toEqual(["Uploaded document"]);
      expect(await actions("?search=max%20man")).toEqual(["Uploaded document"]);
      expect(await actions("?search=CREATED")).toEqual(["Created case"]);
    });

    it("rejects bad filters with field-level messages", async () => {
      const bad = await as(ada).get("/api/v1/audit?from=2026-13-40&ok=maybe&category=Bad%20One");
      expect(bad.status).toBe(422);
      expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["category", "from", "ok"]);
      const range = await as(ada).get("/api/v1/audit?from=2026-05-03&to=2026-05-01");
      expect(range.body.errors).toEqual([{ field: "to", message: "to can't be before from." }]);
    });
  });

  describe("export", () => {
    it("is a CSV attachment, and cells that start with a formula character are prefixed", async () => {
      await entry({ action: '=HYPERLINK("http://evil","click")', target: "+cmd", category: "cases", at: "2026-05-01T10:00:00.000Z" });
      const res = await as(ada).get("/api/v1/audit/export").buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks).toString("utf8")));
      });
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["content-disposition"]).toContain("attachment");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      const body = res.body as unknown as string;
      expect(body).toContain(`"'=HYPERLINK(""http://evil"",""click"")"`);
      expect(body).toContain(",'+cmd,");
      expect(body.split("\r\n").some((line) => /(^|,)[=+@]/.test(line))).toBe(false);
    });

    it("audits the export itself", async () => {
      await as(ada).get("/api/v1/audit/export").buffer(true).parse((r, cb) => { r.on("data", () => undefined); r.on("end", () => cb(null, "")); });
      const logged = await t.prisma.auditLog.findFirst({ where: { action: { startsWith: "Exported the audit log" } } });
      expect(logged).toMatchObject({ actorId: ada.id, ok: true });
    });
  });

  describe("read-only", () => {
    it("has no route that changes an entry", async () => {
      const one = await entry({ action: "Created case", category: "cases", at: "2026-05-01T10:00:00.000Z" });
      for (const path of ["/api/v1/audit", `/api/v1/audit/${one.id}`, "/api/v1/audit/export"]) {
        for (const method of ["post", "put", "patch", "delete"] as const) {
          const res = await as(ada)[method](path).send({ action: "changed" });
          expect([404, 405]).toContain(res.status);
        }
      }
      expect(await t.prisma.auditLog.findUniqueOrThrow({ where: { id: one.id } })).toMatchObject({ action: "Created case" });
    });
  });
});
