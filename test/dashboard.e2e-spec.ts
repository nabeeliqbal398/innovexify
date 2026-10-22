import { api, bearerFor, createAppWithMail, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

type User = Awaited<ReturnType<typeof makeUser>>;
type Kpi = { key: string; value: number; detail?: number };

describe("dashboard overview (e2e)", () => {
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
  let carl: User;
  let cleo: User;
  let alex: User;
  let bea: User;
  let alexCase: { id: string; number: number };

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    ada = await makeUser(t.prisma, { email: "admin@test.dev", name: "Ada Admin", role: "ADMIN" });
    max = await makeUser(t.prisma, { email: "manager@test.dev", name: "Max Manager", role: "MANAGER" });
    sam = await makeUser(t.prisma, { email: "csr@test.dev", name: "Sam Csr", role: "CSR" });
    carl = await makeUser(t.prisma, { email: "csr2@test.dev", name: "Carl Csr", role: "CSR" });
    cleo = await makeUser(t.prisma, { email: "comp@test.dev", name: "Cleo Compliance", role: "COMPLIANCE" });
    alex = await makeUser(t.prisma, { email: "client1@test.dev", name: "Alex Client", role: "CLIENT", csrId: sam.id });
    bea = await makeUser(t.prisma, { email: "client2@test.dev", name: "Bea Client", role: "CLIENT", csrId: sam.id });
    const cal = await makeUser(t.prisma, { email: "client3@test.dev", name: "Cal Client", role: "CLIENT", csrId: carl.id });
    await makeUser(t.prisma, { email: "client4@test.dev", name: "Dee Client", role: "CLIENT", status: "INVITED", password: false });

    const tomorrow = new Date(Date.now() + 86_400_000);
    const kase = (n: number, clientId: string, data: Record<string, unknown>) => t.prisma.case.create({ data: { number: 600 + n, clientId, serviceId: "llc", ...data } as never });
    alexCase = await kase(1, alex.id, { stage: "INFORMATION_REQUIRED", status: "AWAITING_CLIENT", deadline: new Date("2099-01-01") });
    const beaCase = await kase(2, bea.id, { stage: "DOCUMENTS_UNDER_REVIEW", status: "UNDER_REVIEW", priority: "HIGH", deadline: new Date(tomorrow.toISOString().slice(0, 10)), ownerId: cleo.id });
    const calCase = await kase(3, cal.id, { stage: "COMPLETED", status: "COMPLETED", completedAt: new Date() });

    await t.prisma.document.create({ data: { clientId: alex.id, name: "Passport", status: "SUBMITTED", submittedAt: new Date() } });
    await t.prisma.document.create({ data: { clientId: bea.id, name: "Proof of address", status: "REQUESTED" } });
    await t.prisma.document.create({ data: { clientId: cal.id, name: "Lease", status: "SUBMITTED", submittedAt: new Date() } });

    const ticket = (n: number, clientId: string, data: Record<string, unknown>) =>
      t.prisma.ticket.create({ data: { number: 700 + n, clientId, title: `T${n}`, category: "GENERAL_REQUEST", description: "d", ...data } as never });
    await ticket(1, alex.id, { status: "OPEN" });
    await ticket(2, bea.id, { status: "WAITING_FOR_CLIENT", priority: "URGENT" });
    await ticket(3, cal.id, { status: "RESOLVED", resolvedAt: new Date() });

    const task = (caseId: string, data: Record<string, unknown>) =>
      t.prisma.task.create({ data: { caseId, title: "Task", type: "OPERATIONS", createdById: ada.id, assigneeId: sam.id, due: new Date("2099-01-01"), ...data } as never });
    await task(alexCase.id, { title: "Overdue task", due: new Date("2020-01-01") });
    await task(beaCase.id, {});
    await task(calCase.id, { done: true, completedAt: new Date(), completedById: sam.id });
    await t.prisma.followUp.create({ data: { clientId: alex.id, csrId: sam.id, type: "CALL", due: new Date("2020-01-01"), note: "n" } });
  });

  const as = (user: { id: string; role: Parameters<typeof bearerFor>[1]["role"] }) => api(t, bearerFor(t, user));
  const overview = async (who: User) => (await as(who).get("/api/v1/dashboard/overview")).body.data;
  const kpiMap = (data: { kpis: Kpi[] }) => Object.fromEntries(data.kpis.map((k) => [k.key, k.detail === undefined ? k.value : [k.value, k.detail]]));
  const sum = (buckets: Array<{ count: number }>) => buckets.reduce((n, b) => n + b.count, 0);

  it("requires sign-in", async () => {
    expect((await api(t).get("/api/v1/dashboard/overview")).status).toBe(401);
  });

  it("gives the Admin the business overview, counted by hand from the fixture", async () => {
    const d = await overview(ada);
    expect(d.role).toBe("ADMIN");
    expect(kpiMap(d)).toEqual({
      totalClients: [4, 2], // four clients, two unfinished cases
      awaitingClientInformation: 1,
      underComplianceReview: 1,
      stateFilingsInProgress: 0,
      completedFormations: 1,
      openTasks: [2, 1], // two open, one overdue
      pendingDocumentReviews: 2,
      openTickets: [2, 1], // two open, one urgent
    });
    expect(d.stageDistribution).toEqual([
      { stage: "COMPLETED", count: 1 },
      { stage: "DOCUMENTS_UNDER_REVIEW", count: 1 },
      { stage: "INFORMATION_REQUIRED", count: 1 },
    ]);
    expect(d.trends.casesCompletedByMonth).toHaveLength(6);
    expect(d.trends.casesCompletedByMonth.at(-1)).toEqual({ label: new Date().toISOString().slice(0, 7), count: 1 });
    expect(d.trends.casesCompletedByWeek).toHaveLength(8);
    expect(sum(d.trends.casesCompletedByWeek)).toBe(1);
    expect(d.trends.casesCompletedByWeek.at(-1).count).toBe(1);
    expect(d.trends.tasksDoneByMonth.at(-1).count).toBe(1);
    expect(sum(d.trends.tasksDoneByWeek)).toBe(1);
    expect(d.deadlines.map((x: { kind: string; title: string; daysFromToday: number }) => [x.kind, x.title.startsWith("PRJ-602") ? "case" : x.title, x.daysFromToday < 0])).toEqual([
      ["task", "Overdue task", true],
      ["case", "case", false],
    ]);
    expect(d.workload.csrs.map((r: { name: string; clients: number; openFollowUps: number; openTickets: number; load: number }) => [r.name, r.clients, r.openFollowUps, r.openTickets, r.load])).toEqual([
      ["Carl Csr", 1, 0, 0, 12],
      ["Sam Csr", 2, 1, 0, 32], // 2 * 12 + 1 * 8
    ]);
    expect(d.needsAttention.map((x: { kind: string }) => x.kind).sort()).toEqual(["documentToReview", "documentToReview", "ticket", "ticket", "unassignedClient"]);
    expect(d.activity).toBeDefined();
  });

  it("gives the Manager the same counts plus the reports tile, and no audit activity", async () => {
    const d = await overview(max);
    expect(kpiMap(d)).toMatchObject({ totalClients: [4, 2], complianceReports: [0, 0] });
    expect(d.activity).toBeUndefined();
  });

  it("scopes a CSR to their own clients", async () => {
    const sams = await overview(sam);
    expect(sams.role).toBe("CSR");
    expect(kpiMap(sams)).toEqual({
      assignedClients: [2, 0],
      activeCases: 2,
      followUpsDue: [1, 1],
      pendingClientResponses: 2, // Bea's requested document and her ticket waiting for her
      openTickets: 2,
      followUpsCompletedLast30Days: 0,
    });
    expect(sams.needsAttention.map((x: { title: string }) => x.title)).toEqual(["Bea Client"]);
    expect(sams.stageDistribution).toBeUndefined();
    expect(sams.activity).toBeUndefined();
    const carls = await overview(carl);
    expect(kpiMap(carls)).toMatchObject({ assignedClients: [1, 0], activeCases: 0, openTickets: 0, pendingClientResponses: 0 });
  });

  it("gives Compliance the review queue and deadlines", async () => {
    const d = await overview(cleo);
    expect(kpiMap(d)).toEqual({
      documentsAwaitingReview: 2,
      documentsNeedingCorrection: 0,
      upcomingComplianceDeadlines: 1,
      blockedByMissingInformation: 1,
      activeComplianceMilestones: 1,
      highPriorityCases: 1,
      reportsAwaitingReview: 0,
    });
    expect(d.needsAttention).toHaveLength(2);
  });

  it("gives a client only their own figures", async () => {
    const a = await overview(alex);
    expect(a.role).toBe("CLIENT");
    expect(kpiMap(a)).toEqual({ documentsNeedingAction: 0, openTickets: 1, unreadNotifications: 0 });
    expect(a.case).toMatchObject({ id: alexCase.id, number: 601, stage: "INFORMATION_REQUIRED" });
    expect(kpiMap(await overview(bea))).toMatchObject({ documentsNeedingAction: 1, openTickets: 1 });
    const text = JSON.stringify(a);
    expect(text).not.toContain("Bea");
    expect(text).not.toContain("Cal Client");
  });

  it("handles an empty database with zeros and empty lists", async () => {
    await resetDatabase(t.prisma);
    const admin = await makeUser(t.prisma, { email: "a2@test.dev", name: "A2", role: "ADMIN" });
    const d = await overview(admin);
    expect(d.kpis.every((k: Kpi) => k.value === 0)).toBe(true);
    expect(d.stageDistribution).toEqual([]);
    expect(sum(d.trends.casesCompletedByMonth)).toBe(0);
    expect(d.deadlines).toEqual([]);
    expect(d.workload).toEqual({ csrs: [], compliance: [] });
  });
});
