import { api, bearerFor, createAppWithMail, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

type User = Awaited<ReturnType<typeof makeUser>>;
type Group = { key: string; label: string; items: Array<{ title: string; meta: string; target: { view: string; id?: string; query?: Record<string, string> } }> };

describe("global search (e2e)", () => {
  let t: TestApp & { mail: RecordingMail };

  beforeAll(async () => {
    t = await createAppWithMail({ SEARCH_RATE_LIMIT_PER_MIN: "20" });
  });
  afterAll(async () => {
    await t.close();
  });

  let ada: User;
  let max: User;
  let sam: User;
  let carl: User;
  let cleo: User;
  let alex: User;
  let cal: User;

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    ada = await makeUser(t.prisma, { email: "admin@test.dev", name: "Ada Admin", role: "ADMIN" });
    max = await makeUser(t.prisma, { email: "manager@test.dev", name: "Max Manager", role: "MANAGER" });
    sam = await makeUser(t.prisma, { email: "csr@test.dev", name: "Sam Csr", role: "CSR" });
    carl = await makeUser(t.prisma, { email: "csr2@test.dev", name: "Carl Csr", role: "CSR" });
    cleo = await makeUser(t.prisma, { email: "comp@test.dev", name: "Cleo Compliance", role: "COMPLIANCE" });
    alex = await makeUser(t.prisma, { email: "alex@test.dev", name: "Alex Zebra", role: "CLIENT", csrId: sam.id });
    cal = await makeUser(t.prisma, { email: "cal@test.dev", name: "Cal Zebra", role: "CLIENT", csrId: carl.id });
    await t.prisma.clientProfile.update({ where: { userId: alex.id }, data: { businessName: "Zebra Crossing LLC" } });
    await t.prisma.clientProfile.update({ where: { userId: cal.id }, data: { businessName: "Zebra Stripes Inc" } });

    for (const [n, client] of [[1, alex], [2, cal]] as const) {
      const kase = await t.prisma.case.create({ data: { number: 800 + n, clientId: client.id, serviceId: "llc", stage: "DOCUMENTS_PENDING" } });
      await t.prisma.task.create({ data: { caseId: kase.id, title: `Zebra task ${n}`, type: "OPERATIONS", createdById: ada.id, assigneeId: ada.id, due: new Date("2099-01-01") } });
      const ticket = await t.prisma.ticket.create({ data: { number: 900 + n, clientId: client.id, title: `Zebra ticket ${n}`, category: "GENERAL_REQUEST", description: "d" } });
      await t.prisma.ticketMessage.create({ data: { ticketId: ticket.id, authorId: ada.id, text: "Secret internal zebra remark", internal: true } as never }).catch(() => undefined);
      await t.prisma.message.create({ data: { clientId: client.id, senderId: client.id, text: `Please look at zebra paperwork ${n}` } });
      await t.prisma.document.create({ data: { clientId: client.id, name: `Zebra lease ${n}`, status: "SUBMITTED" } });
    }
  });

  const as = (user: { id: string; role: Parameters<typeof bearerFor>[1]["role"] }) => api(t, bearerFor(t, user));
  const search = async (who: User, q: string): Promise<Group[]> => (await as(who).get(`/api/v1/search?q=${encodeURIComponent(q)}`)).body.data.groups;
  const titles = (groups: Group[], key: string): string[] => groups.find((g) => g.key === key)?.items.map((i) => i.title) ?? [];

  describe("input", () => {
    it("needs 2 to 100 characters, trimmed, with a message on q", async () => {
      for (const q of ["", "z", " z "]) {
        const res = await as(ada).get(`/api/v1/search?q=${encodeURIComponent(q)}`);
        expect(res.status).toBe(422);
        expect(res.body.errors).toEqual([{ field: "q", message: "Type at least 2 characters to search." }]);
      }
      expect((await as(ada).get("/api/v1/search")).status).toBe(422);
      const long = await as(ada).get(`/api/v1/search?q=${"a".repeat(101)}`);
      expect(long.body.errors).toEqual([{ field: "q", message: "Search text can't be longer than 100 characters." }]);
      expect((await as(ada).get(`/api/v1/search?q=${"a".repeat(100)}`)).status).toBe(200);
    });

    it("requires sign-in", async () => {
      expect((await api(t).get("/api/v1/search?q=zebra")).status).toBe(401);
    });
  });

  describe("shape", () => {
    it("returns groups of { title, meta, target } in the order the screen shows them", async () => {
      const res = await as(ada).get("/api/v1/search?q=zebra");
      expect(res.body.data.query).toBe("zebra");
      expect(res.body.data.groups.map((g: Group) => g.key)).toEqual(["clients", "cases", "tasks", "tickets", "messages"]);
      const client = res.body.data.groups[0].items[0];
      expect(client).toEqual({ title: "Alex Zebra", meta: expect.stringContaining("Zebra Crossing LLC"), target: { view: "clients", query: { client: alex.id } } });
      expect(res.body.data.groups[3].items.map((i: { target: { query?: { ticket?: string } } }) => i.target.query?.ticket)).toEqual(["TKT-902", "TKT-901"]);
      expect(res.body.data.groups[3].items[1].target).toEqual({ view: "tickets", query: { ticket: "TKT-901", filter: "all" } });
    });

    it("matches case-insensitively, by ID prefix and by stage", async () => {
      expect(titles(await search(ada, "ZEBRA"), "clients")).toEqual(["Alex Zebra", "Cal Zebra"]);
      expect(titles(await search(ada, "prj-801"), "cases")).toEqual(["PRJ-801 · Alex Zebra"]);
      expect(titles(await search(ada, "tkt-902"), "tickets")).toEqual(["TKT-902 · Zebra ticket 2"]);
      expect((await search(ada, "documents pending")).find((g) => g.key === "cases")?.items).toHaveLength(2);
    });

    it("returns no groups for no match, not an error", async () => {
      const res = await as(ada).get("/api/v1/search?q=nothingmatchesthis");
      expect(res.status).toBe(200);
      expect(res.body.data.groups).toEqual([]);
    });
  });

  describe("scoping", () => {
    it("shows a CSR only their own clients' records and nothing of another CSR's", async () => {
      const mine = await search(sam, "zebra");
      expect(titles(mine, "clients")).toEqual(["Alex Zebra"]);
      expect(titles(mine, "cases")).toEqual(["PRJ-801 · Alex Zebra"]);
      expect(titles(mine, "tickets")).toEqual(["TKT-901 · Zebra ticket 1"]);
      expect(titles(mine, "messages")).toHaveLength(1);
      expect(JSON.stringify(mine)).not.toContain("Cal Zebra");
      expect(JSON.stringify(mine)).not.toContain(cal.id);

      // Searching directly for the other CSR's client, case, ticket and message finds nothing.
      for (const q of ["Cal Zebra", "Stripes", "PRJ-802", "TKT-902", "paperwork 2", cal.email]) expect(await search(sam, q)).toEqual([]);
    });

    it("does not show a CSR tasks at all, and shows Admin and Manager every task", async () => {
      expect(titles(await search(sam, "zebra"), "tasks")).toEqual([]);
      expect(titles(await search(cleo, "zebra"), "tasks")).toEqual([]);
      expect(titles(await search(ada, "zebra"), "tasks")).toEqual(["Zebra task 1", "Zebra task 2"]);
      expect(titles(await search(max, "zebra"), "tasks")).toEqual(["Zebra task 1", "Zebra task 2"]);
    });

    it("lets Compliance search every client, case and conversation, but not documents", async () => {
      const groups = await search(cleo, "zebra");
      expect(titles(groups, "clients")).toHaveLength(2);
      expect(titles(groups, "messages")).toHaveLength(2);
      expect(groups.find((g) => g.key === "documents")).toBeUndefined();
      expect((await search(ada, "zebra lease")).find((g) => g.key === "documents")).toBeUndefined();
    });

    it("shows a client only their own case, tickets, messages and documents", async () => {
      const groups = await search(alex, "zebra");
      expect(groups.map((g) => g.key)).toEqual(["cases", "tickets", "messages", "documents"]);
      expect(titles(groups, "tickets")).toEqual(["TKT-901 · Zebra ticket 1"]);
      expect(titles(groups, "documents")).toEqual(["Zebra lease 1"]);
      expect(JSON.stringify(groups)).not.toContain("Cal Zebra");
      expect(JSON.stringify(groups)).not.toContain("Zebra ticket 2");
      expect(titles(await search(alex, "PRJ-801"), "cases")).toEqual(["PRJ-801"]);
      expect(await search(alex, "PRJ-802")).toEqual([]);
      expect(await search(alex, "Cal Zebra")).toEqual([]);
    });

    it("never searches internal ticket notes", async () => {
      expect(await search(ada, "Secret internal")).toEqual([]);
      expect(await search(alex, "Secret internal")).toEqual([]);
    });

    it("leaves out removed clients", async () => {
      // Removing a client soft-deletes their cases too (UsersRepository), so the fixture does the same.
      await t.prisma.user.update({ where: { id: cal.id }, data: { deletedAt: new Date(), status: "REMOVED" } });
      await t.prisma.case.updateMany({ where: { clientId: cal.id }, data: { deletedAt: new Date() } });
      expect(titles(await search(ada, "zebra"), "clients")).toEqual(["Alex Zebra"]);
      expect(await search(ada, "Zebra Stripes")).toEqual([]);
      // Their cases are gone with them, so the tasks on those cases are too.
      expect(titles(await search(ada, "zebra"), "tasks")).toEqual(["Zebra task 1"]);
      expect(titles(await search(max, "zebra"), "cases")).toEqual(["PRJ-801 · Alex Zebra"]);
    });
  });

  describe("safety", () => {
    it("treats % and _ as plain characters", async () => {
      await t.prisma.message.create({ data: { clientId: alex.id, senderId: sam.id, text: "Fee is 100% refundable_today" } });
      expect(await search(ada, "%%")).toEqual([]);
      expect(await search(ada, "__")).toEqual([]);
      expect(titles(await search(ada, "100%"), "messages")).toEqual([expect.stringContaining("Fee is 100% refundable_today")]);
      expect(titles(await search(ada, "ble_to"), "messages")).toHaveLength(1);
      expect(await search(ada, "ble%to")).toEqual([]);
      expect(await search(ada, "\\\\")).toEqual([]);
    });

    it("takes SQL in the query as text", async () => {
      for (const q of ["'; DROP TABLE \"User\"; --", "' OR '1'='1", "zebra' OR 1=1 --"]) {
        const res = await as(ada).get(`/api/v1/search?q=${encodeURIComponent(q)}`);
        expect(res.status).toBe(200);
        expect(res.body.data.groups).toEqual([]);
      }
      expect(await t.prisma.user.count()).toBe(7);
    });

    it("returns at most 5 per kind", async () => {
      for (let i = 0; i < 8; i++) await makeUser(t.prisma, { email: `extra${i}@test.dev`, name: `Extra Person ${i}`, role: "CLIENT", csrId: sam.id });
      expect(titles(await search(ada, "extra person"), "clients")).toHaveLength(5);
    });

    it("limits how often one person can search, and not another's", async () => {
      const results: number[] = [];
      for (let i = 0; i < 22; i++) results.push((await as(carl).get("/api/v1/search?q=zebra")).status);
      expect(results.filter((s) => s === 200)).toHaveLength(20);
      expect(results.slice(20)).toEqual([429, 429]);
      expect((await as(sam).get("/api/v1/search?q=zebra")).status).toBe(200);
    });
  });
});
