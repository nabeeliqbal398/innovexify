import { findForbiddenFields } from "./forbidden-fields";
import { api, bearerFor, createAppWithMail, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

type User = Awaited<ReturnType<typeof makeUser>>;

describe("responses never carry secrets (e2e)", () => {
  describe("the scanner", () => {
    it("finds a forbidden field at any depth, in objects and arrays", () => {
      expect(findForbiddenFields({ a: [{ b: { passwordHash: "x" } }], tokenHash: "y" }, false)).toEqual([
        { path: "$.a[0].b.passwordHash", field: "passwordHash" },
        { path: "$.tokenHash", field: "tokenHash" },
      ]);
      expect(findForbiddenFields([{ storageKey: "k" }, { attachmentKey: "k" }], false)).toHaveLength(2);
    });

    it("allows refreshToken only while ALLOW_BODY_REFRESH is on", () => {
      expect(findForbiddenFields({ refreshToken: "t" }, false)).toHaveLength(1);
      expect(findForbiddenFields({ refreshToken: "t" }, true)).toHaveLength(0);
      expect(findForbiddenFields({ passwordHash: "t" }, true)).toHaveLength(1);
    });

    it("is quiet about ordinary bodies", () => {
      expect(findForbiddenFields({ data: [{ id: 1, name: "x", attachmentName: "a.pdf", hasAttachment: true }], meta: null }, false)).toEqual([]);
      expect(findForbiddenFields("text", false)).toEqual([]);
      expect(findForbiddenFields(null, false)).toEqual([]);
    });
  });

  describe("every kind of endpoint, as every role", () => {
    let t: TestApp & { mail: RecordingMail };
    beforeAll(async () => {
      t = await createAppWithMail();
    });
    afterAll(async () => {
      await t.close();
    });

    let people: Record<string, User>;
    beforeEach(async () => {
      await resetDatabase(t.prisma);
      const ada = await makeUser(t.prisma, { email: "admin@test.dev", name: "Ada Admin", role: "ADMIN" });
      const max = await makeUser(t.prisma, { email: "manager@test.dev", name: "Max Manager", role: "MANAGER" });
      const sam = await makeUser(t.prisma, { email: "csr@test.dev", name: "Sam Csr", role: "CSR" });
      const cleo = await makeUser(t.prisma, { email: "comp@test.dev", name: "Cleo Compliance", role: "COMPLIANCE" });
      const alex = await makeUser(t.prisma, { email: "client1@test.dev", name: "Alex Client", role: "CLIENT", csrId: sam.id });
      people = { ada, max, sam, cleo, alex };
      const kase = await t.prisma.case.create({ data: { number: 950, clientId: alex.id, serviceId: "llc" } });
      await t.prisma.task.create({ data: { caseId: kase.id, title: "T", type: "OPERATIONS", createdById: ada.id, assigneeId: sam.id, due: new Date("2099-01-01") } });
      await t.prisma.document.create({ data: { clientId: alex.id, name: "Passport", status: "SUBMITTED", fileName: "p.pdf", storageKey: "secret/path/p.pdf", mimeType: "application/pdf", sizeBytes: 10 } });
      await t.prisma.message.create({ data: { clientId: alex.id, senderId: ada.id, text: "Hi", attachmentName: "a.pdf", attachmentKey: "secret/path/a.pdf", attachmentMime: "application/pdf", attachmentSize: 10 } });
      await t.prisma.ticket.create({ data: { number: 960, clientId: alex.id, title: "Help", category: "GENERAL_REQUEST", description: "d" } });
      await t.prisma.announcement.create({ data: { title: "A", body: "B", priority: "NORMAL", status: "PUBLISHED", publishedAt: new Date(), createdById: ada.id } as never }).catch(() => undefined);
      await t.prisma.notification.create({ data: { userId: alex.id, text: "n", link: "cdocs" } });
    });

    const paths = [
      "/api/v1/auth/me",
      "/api/v1/users",
      "/api/v1/clients",
      "/api/v1/cases",
      "/api/v1/tasks",
      "/api/v1/documents",
      "/api/v1/reports",
      "/api/v1/follow-ups",
      "/api/v1/filings",
      "/api/v1/announcements",
      "/api/v1/tickets",
      "/api/v1/notifications",
      "/api/v1/conversations",
      "/api/v1/audit",
      "/api/v1/company",
      "/api/v1/services",
      "/api/v1/automation/triggers",
      "/api/v1/access/matrix",
      "/api/v1/dashboard/overview",
      "/api/v1/analytics",
      "/api/v1/search?q=al",
    ];

    it("lists, overviews and searches carry none of the forbidden fields", async () => {
      let ok = 0;
      for (const who of Object.values(people)) {
        for (const path of paths) {
          const res = await api(t, bearerFor(t, who)).get(path);
          expect(findForbiddenFields(res.body, false)).toEqual([]);
          if (res.status === 200) ok++;
        }
      }
      expect(ok).toBeGreaterThan(40); // most of the combinations really returned data, so this is not scanning only error bodies
    });

    it("details carry none either, including a document and a message that have stored files", async () => {
      const doc = await t.prisma.document.findFirstOrThrow();
      const ticket = await t.prisma.ticket.findFirstOrThrow();
      const kase = await t.prisma.case.findFirstOrThrow();
      const details = [`/api/v1/documents/${doc.id}`, `/api/v1/tickets/${ticket.id}`, `/api/v1/cases/${kase.id}`, `/api/v1/clients/${people.alex?.id}`, `/api/v1/clients/${people.alex?.id}/messages`];
      for (const who of [people.ada, people.sam, people.alex] as User[]) {
        for (const path of details) {
          const res = await api(t, bearerFor(t, who)).get(path);
          expect(findForbiddenFields(res.body, false)).toEqual([]);
          expect(JSON.stringify(res.body)).not.toContain("secret/path");
        }
      }
    });
  });
});
