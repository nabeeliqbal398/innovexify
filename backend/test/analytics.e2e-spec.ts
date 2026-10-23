import { AnalyticsRepository } from "../src/modules/analytics/repository/analytics.repository";
import { api, bearerFor, createAppWithMail, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

type User = Awaited<ReturnType<typeof makeUser>>;

const at = (iso: string): Date => new Date(`${iso}Z`);

describe("analytics (e2e)", () => {
  let t: TestApp & { mail: RecordingMail };

  beforeAll(async () => {
    t = await createAppWithMail({ ANALYTICS_CACHE_SECONDS: "60" });
  });
  afterAll(async () => {
    await t.close();
  });

  let ada: User;
  let max: User;
  let sam: User;
  let cleo: User;
  let alex: User;

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    ada = await makeUser(t.prisma, { email: "admin@test.dev", name: "Ada Admin", role: "ADMIN" });
    max = await makeUser(t.prisma, { email: "manager@test.dev", name: "Max Manager", role: "MANAGER" });
    sam = await makeUser(t.prisma, { email: "csr@test.dev", name: "Sam Csr", role: "CSR" });
    cleo = await makeUser(t.prisma, { email: "comp@test.dev", name: "Cleo Compliance", role: "COMPLIANCE" });
    alex = await makeUser(t.prisma, { email: "client1@test.dev", name: "Alex Client", role: "CLIENT", csrId: sam.id });
  });

  const as = (user: { id: string; role: Parameters<typeof bearerFor>[1]["role"] }) => api(t, bearerFor(t, user));
  const range = "?from=2026-05-01&to=2026-07-31";

  describe("access and validation", () => {
    it("is for Admin and Manager only", async () => {
      expect((await as(ada).get("/api/v1/analytics")).status).toBe(200);
      expect((await as(max).get("/api/v1/analytics")).status).toBe(200);
      for (const who of [sam, cleo, alex]) {
        const res = await as(who).get("/api/v1/analytics");
        expect(res.status).toBe(403);
        expect(res.body.errorCode).toBe("PERMISSION_DENIED");
      }
      expect((await api(t).get("/api/v1/analytics")).status).toBe(401);
    });

    it("validates the dates with messages on the field", async () => {
      expect((await as(ada).get("/api/v1/analytics?from=2026-13-01")).body.errors).toEqual([{ field: "from", message: "from must be a real date as YYYY-MM-DD." }]);
      expect((await as(ada).get("/api/v1/analytics?to=yesterday")).body.errors[0].field).toBe("to");
      const backwards = await as(ada).get("/api/v1/analytics?from=2026-06-02&to=2026-06-01");
      expect(backwards.status).toBe(422);
      expect(backwards.body.errors).toEqual([{ field: "to", message: "to can't be before from." }]);
    });

    it("allows exactly 24 months and refuses a day more", async () => {
      expect((await as(ada).get("/api/v1/analytics?from=2024-01-01&to=2025-12-31")).status).toBe(200);
      expect((await as(ada).get("/api/v1/analytics?from=2024-01-31&to=2026-01-31")).status).toBe(200);
      const tooLong = await as(ada).get("/api/v1/analytics?from=2024-01-01&to=2026-01-02");
      expect(tooLong.status).toBe(422);
      expect(tooLong.body.errors[0]).toEqual({ field: "to", message: "The range can't be longer than 24 months. Choose a shorter one." });
    });

    it("defaults to the last 90 days ending today", async () => {
      const res = await as(ada).get("/api/v1/analytics");
      const today = new Date().toISOString().slice(0, 10);
      expect(res.body.data.range.to).toBe(today);
      const days = (new Date(`${res.body.data.range.to}T00:00:00Z`).getTime() - new Date(`${res.body.data.range.from}T00:00:00Z`).getTime()) / 86_400_000;
      expect(days).toBe(89);
    });
  });

  describe("an empty database", () => {
    it("gives zeros and nulls, never NaN or a made-up zero average", async () => {
      const { body } = await as(ada).get(`/api/v1/analytics${range}`);
      expect(body.data.cases).toMatchObject({ completed: 0, averageDaysToComplete: null, byStage: [] });
      expect(body.data.cases.completedByMonth).toEqual([
        { month: "2026-05", count: 0 },
        { month: "2026-06", count: 0 },
        { month: "2026-07", count: 0 },
      ]);
      expect(body.data.documentReviews).toEqual({ reviewed: 0, averageHoursToReview: null, sentBack: 0, sentBackRate: null });
      expect(body.data.tickets).toEqual({ resolved: 0, averageHoursToResolve: null, open: 0, reopened: 0 });
      expect(body.data.onboarding.clients).toBe(1);
      await t.prisma.user.delete({ where: { id: alex.id } }).catch(() => undefined);
    });

    it("gives null percentages when there are no clients", async () => {
      await t.prisma.clientProfile.deleteMany();
      await t.prisma.user.deleteMany({ where: { role: "CLIENT" } });
      const { body } = await as(ada).get(`/api/v1/analytics${range}`);
      expect(body.data.onboarding.clients).toBe(0);
      expect(body.data.onboarding.steps.every((s: { count: number; percent: number | null }) => s.count === 0 && s.percent === null)).toBe(true);
      expect(JSON.stringify(body)).not.toMatch(/NaN|Infinity/);
    });
  });

  describe("figures computed by hand from a fixture", () => {
    beforeEach(async () => {
      const bea = await makeUser(t.prisma, { email: "client2@test.dev", name: "Bea Client", role: "CLIENT", csrId: sam.id });
      const cal = await makeUser(t.prisma, { email: "client3@test.dev", name: "Cal Client", role: "CLIENT" });
      await makeUser(t.prisma, { email: "client4@test.dev", name: "Dee Client", role: "CLIENT", status: "INVITED", password: false });
      const kase = (clientId: string, data: Record<string, unknown>, n: number) =>
        t.prisma.case.create({ data: { number: 500 + n, clientId, serviceId: "llc", ...data } as never });
      // Alex: 10 days to complete (May). Bea: 20.5 days (June). Cal: still in review, owned by Cleo.
      await kase(alex.id, { stage: "COMPLETED", status: "COMPLETED", createdAt: at("2026-05-01T00:00:00.000"), completedAt: at("2026-05-11T00:00:00.000") }, 1);
      await kase(bea.id, { stage: "COMPLETED", status: "COMPLETED", createdAt: at("2026-06-01T00:00:00.000"), completedAt: at("2026-06-21T12:00:00.000") }, 2);
      const calCase = await kase(cal.id, { stage: "DOCUMENTS_UNDER_REVIEW", status: "UNDER_REVIEW", ownerId: cleo.id }, 3);

      const doc = (clientId: string, status: string, submittedAt: string | null, reviewedAt: string | null) =>
        t.prisma.document.create({
          data: { clientId, name: "Doc", status: status as never, submittedAt: submittedAt ? at(submittedAt) : null, reviewedAt: reviewedAt ? at(reviewedAt) : null, reviewedById: reviewedAt ? cleo.id : null },
        });
      await doc(alex.id, "APPROVED", "2026-06-01T00:00:00.000", "2026-06-01T10:00:00.000"); // 10 h
      await doc(alex.id, "REJECTED", "2026-06-02T00:00:00.000", "2026-06-02T02:00:00.000"); // 2 h, sent back
      await doc(bea.id, "INFO", "2026-06-03T00:00:00.000", "2026-06-04T00:00:00.000"); // 24 h, sent back
      await doc(bea.id, "APPROVED", "2026-08-01T00:00:00.000", "2026-08-15T00:00:00.000"); // after the range
      await doc(bea.id, "REQUESTED", null, null); // never submitted

      const ticket = (number: number, clientId: string, data: Record<string, unknown>) =>
        t.prisma.ticket.create({ data: { number: 800 + number, clientId, title: `T${number}`, category: "GENERAL_REQUEST", description: "d", ...data } as never });
      const t1 = await ticket(1, alex.id, { status: "RESOLVED", createdAt: at("2026-06-01T00:00:00.000"), resolvedAt: at("2026-06-02T00:00:00.000") }); // 24 h
      await ticket(2, bea.id, { status: "CLOSED", createdAt: at("2026-06-10T00:00:00.000"), resolvedAt: at("2026-06-10T06:00:00.000") }); // 6 h
      await ticket(3, alex.id, { status: "OPEN", handlerId: sam.id });
      await ticket(4, bea.id, { status: "IN_PROGRESS" });
      await t.prisma.ticketEvent.create({ data: { ticketId: t1.id, fromStatus: "RESOLVED", toStatus: "OPEN", byId: alex.id, note: "Client requested reopening", at: at("2026-06-05T00:00:00.000") } });

      const task = (data: Record<string, unknown>) =>
        t.prisma.task.create({ data: { caseId: calCase.id, title: "x", type: "OPERATIONS", createdById: ada.id, assigneeId: cleo.id, due: new Date("2099-01-01"), ...data } as never });
      await task({ done: true, completedAt: at("2026-06-05T00:00:00.000"), completedById: cleo.id });
      await task({ done: true, completedAt: at("2026-06-06T00:00:00.000"), completedById: cleo.id });
      await task({ done: true, completedAt: at("2026-08-06T00:00:00.000"), completedById: cleo.id }); // after the range
      await task({ due: new Date("2020-01-01") }); // open and overdue
      await task({ assigneeId: sam.id }); // open, not overdue, Sam's

      await t.prisma.followUp.create({ data: { clientId: alex.id, csrId: sam.id, type: "CALL", due: new Date("2099-01-01"), note: "n" } });
      await t.prisma.followUp.create({ data: { clientId: alex.id, csrId: sam.id, type: "CALL", due: new Date("2026-06-01"), note: "n", status: "DONE", doneAt: at("2026-06-05T00:00:00.000") } });
      await t.prisma.followUp.create({ data: { clientId: alex.id, csrId: sam.id, type: "CALL", due: new Date("2026-09-01"), note: "n", status: "DONE", doneAt: at("2026-09-05T00:00:00.000") } });
      await t.prisma.interaction.create({ data: { clientId: alex.id, byId: sam.id, kind: "CALL", text: "a", at: at("2026-06-01T00:00:00.000") } });
      await t.prisma.interaction.create({ data: { clientId: bea.id, byId: sam.id, kind: "EMAIL", text: "b", at: at("2026-07-01T00:00:00.000") } });
      await t.prisma.interaction.create({ data: { clientId: bea.id, byId: sam.id, kind: "EMAIL", text: "c", at: at("2026-09-01T00:00:00.000") } });
      const report = await t.prisma.report.create({ data: { number: 900, clientId: alex.id, csrId: sam.id, title: "r", body: "b" } });
      await t.prisma.reportEvent.createMany({
        data: [
          { reportId: report.id, status: "ACKNOWLEDGED", byId: cleo.id, at: at("2026-06-02T00:00:00.000") },
          { reportId: report.id, status: "REVIEWED", byId: cleo.id, at: at("2026-06-03T00:00:00.000") },
        ],
      });
    });

    it("matches the numbers worked out from the fixture", async () => {
      const { body } = await as(ada).get(`/api/v1/analytics${range}`);
      const d = body.data;
      expect(d.range).toEqual({ from: "2026-05-01", to: "2026-07-31" });

      expect(d.cases.completed).toBe(2);
      expect(d.cases.averageDaysToComplete).toBe(15.3); // (10 + 20.5) / 2 = 15.25
      expect(d.cases.completedByMonth).toEqual([
        { month: "2026-05", count: 1 },
        { month: "2026-06", count: 1 },
        { month: "2026-07", count: 0 },
      ]);
      expect(d.cases.byStage).toEqual([
        { key: "COMPLETED", count: 2 },
        { key: "DOCUMENTS_UNDER_REVIEW", count: 1 },
      ]);
      expect(d.cases.byStatus).toEqual([
        { key: "COMPLETED", count: 2 },
        { key: "UNDER_REVIEW", count: 1 },
      ]);

      expect(d.documentReviews).toEqual({ reviewed: 3, averageHoursToReview: 12, sentBack: 2, sentBackRate: 0.667 });
      expect(d.tickets).toEqual({ resolved: 2, averageHoursToResolve: 15, open: 2, reopened: 1 });
      expect(d.tasks).toEqual({ done: 2, open: 2, overdue: 1 });

      expect(d.csrs).toEqual([{ id: sam.id, name: "Sam Csr", clients: 2, openFollowUps: 1, followUpsDone: 1, interactions: 2, openTickets: 1 }]);
      expect(d.compliance).toEqual([{ id: cleo.id, name: "Cleo Compliance", reviews: 3, ownedCases: 1, openTasks: 1, reportsTouched: 1 }]);

      expect(d.onboarding.clients).toBe(4);
      expect(d.onboarding.steps).toEqual([
        { key: "acceptedInvitation", count: 3, percent: 75 },
        { key: "caseOpened", count: 3, percent: 75 },
        { key: "documentsUnderReviewOrLater", count: 3, percent: 75 },
        { key: "formationCompleted", count: 2, percent: 50 },
      ]);
    });

    it("counts the whole last day, and only what falls inside the range", async () => {
      const june = (await as(ada).get("/api/v1/analytics?from=2026-06-21&to=2026-06-21")).body.data;
      expect(june.cases.completed).toBe(1); // completed 2026-06-21T12:00, inside the last day
      const before = (await as(ada).get("/api/v1/analytics?from=2026-06-22&to=2026-06-30")).body.data;
      expect(before.cases.completed).toBe(0);
      expect(before.cases.averageDaysToComplete).toBeNull();
    });

    it("gives a Manager the same figures", async () => {
      const a = (await as(ada).get(`/api/v1/analytics${range}`)).body.data;
      const m = (await as(max).get(`/api/v1/analytics${range}`)).body.data;
      expect({ ...m, generatedAt: 0 }).toEqual({ ...a, generatedAt: 0 });
    });
  });

  describe("cache", () => {
    it("serves a repeat request for the same range from memory, and a different range afresh", async () => {
      const repo = t.app.get(AnalyticsRepository);
      const spy = jest.spyOn(repo, "casesByStage");
      try {
        const first = await as(ada).get(`/api/v1/analytics${range}`);
        const second = await as(ada).get(`/api/v1/analytics${range}`);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(second.body.data.generatedAt).toBe(first.body.data.generatedAt);
        await as(ada).get("/api/v1/analytics?from=2026-05-01&to=2026-07-30");
        expect(spy).toHaveBeenCalledTimes(2);
        await as(max).get(`/api/v1/analytics${range}`);
        expect(spy).toHaveBeenCalledTimes(3);
      } finally {
        spy.mockRestore();
      }
    });

    it("does not cache when the lifetime is 0", async () => {
      const off = await createAppWithMail({ ANALYTICS_CACHE_SECONDS: "0" });
      try {
        const spy = jest.spyOn(off.app.get(AnalyticsRepository), "casesByStage");
        const admin = await makeUser(off.prisma, { email: "admin2@test.dev", name: "A2", role: "ADMIN" });
        await api(off, bearerFor(off, admin)).get(`/api/v1/analytics${range}`);
        await api(off, bearerFor(off, admin)).get(`/api/v1/analytics${range}`);
        expect(spy).toHaveBeenCalledTimes(2);
      } finally {
        await off.close();
      }
    });
  });
});
