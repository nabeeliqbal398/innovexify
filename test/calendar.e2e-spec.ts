import { api, bearerFor, createAppWithMail, makeCase, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

type User = Awaited<ReturnType<typeof makeUser>>;

describe("compliance calendar (e2e)", () => {
  let t: TestApp & { mail: RecordingMail };

  beforeAll(async () => {
    t = await createAppWithMail();
  });
  afterAll(async () => {
    await t.close();
  });

  let ada: User;
  let sam: User;
  let cleo: User;
  let alex: User;
  let caseId: string;

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    ada = await makeUser(t.prisma, { email: "admin@test.dev", name: "Ada Admin", role: "ADMIN" });
    sam = await makeUser(t.prisma, { email: "csr@test.dev", name: "Sam Csr", role: "CSR" });
    cleo = await makeUser(t.prisma, { email: "comp@test.dev", name: "Cleo Compliance", role: "COMPLIANCE" });
    alex = await makeUser(t.prisma, { email: "client1@test.dev", name: "Alex Client", role: "CLIENT", csrId: sam.id });
    const kase = await makeCase(t.prisma, { clientId: alex.id, deadline: new Date("2025-11-10T00:00:00.000Z"), ownerId: cleo.id });
    caseId = kase.id;
    await t.prisma.filing.create({ data: { number: 1, caseId, type: "Articles", status: "SUBMITTED", submittedOn: new Date("2026-10-01"), nextAction: "Chase the state", nextActionDate: new Date("2025-11-12") } });
    await t.prisma.filing.create({ data: { number: 2, caseId, type: "EIN", status: "APPROVED", reference: "R", submittedOn: new Date("2026-10-01"), nextAction: "Done already", nextActionDate: new Date("2025-11-13") } });
    await t.prisma.task.create({ data: { caseId, title: "Review lease", type: "COMPLIANCE", createdById: ada.id, assigneeId: cleo.id, due: new Date("2025-11-14") } });
    await t.prisma.task.create({ data: { caseId, title: "Ops errand", type: "OPERATIONS", createdById: ada.id, assigneeId: cleo.id, due: new Date("2025-11-14") } });
    await t.prisma.reminder.create({ data: { caseId, title: "Annual report", date: new Date("2025-11-15"), kind: "Annual report" } });
    // Requested 2025-11-01: the chase date is 2025-11-08.
    await t.prisma.document.create({ data: { clientId: alex.id, name: "Passport", status: "REQUESTED", requestedAt: new Date("2025-11-01T10:00:00.000Z") } });
    await t.prisma.document.create({ data: { clientId: alex.id, name: "Approved one", status: "APPROVED", requestedAt: new Date("2025-11-01T10:00:00.000Z") } });
  });

  const as = (user: { id: string; role: Parameters<typeof bearerFor>[1]["role"] }) => api(t, bearerFor(t, user));
  const get = (user: User, from: string, to: string) => as(user).get(`/api/v1/calendar?from=${from}&to=${to}`);

  it("lists every kind in the window with its date, and leaves out finished work", async () => {
    const res = await get(ada, "2025-11-01", "2025-11-30");
    expect(res.status).toBe(200);
    const rows = res.body.data.items.map((i: { kind: string; date: string; title: string }) => [i.kind, i.date, i.title]);
    expect(rows).toEqual([
      ["missing", "2025-11-08", "Passport"],
      ["case", "2025-11-10", ""],
      ["filing", "2025-11-12", "Chase the state"],
      ["task", "2025-11-14", "Review lease"],
      ["reminder", "2025-11-15", "Annual report"],
    ]);
    expect(res.body.data.items[1]).toMatchObject({ clientName: "Alex Client", caseId, caseDisplay: expect.stringMatching(/^PRJ-\d+$/) });
    expect(res.body.data.items[0]).toMatchObject({ documentId: expect.any(String), caseId: null });
  });

  it("only returns what falls inside the days asked for, the last day included", async () => {
    expect((await get(ada, "2025-11-10", "2025-11-10")).body.data.items.map((i: { kind: string }) => i.kind)).toEqual(["case"]);
    expect((await get(ada, "2025-11-16", "2025-11-30")).body.data.items).toEqual([]);
  });

  it("flags overdue items by the server's today, and counts every overdue item anywhere", async () => {
    const res = await get(ada, "2025-11-01", "2025-11-30");
    expect(res.body.data.items.every((i: { overdue: boolean }) => i.overdue)).toBe(true); // every fixture date is in the past
    // case target, open filing follow-up, overdue chase, compliance task, reminder: five, none finished.
    expect(res.body.data.overdueTotal).toBe(5);
    const far = await get(ada, "2099-01-01", "2099-01-31");
    expect(far.body.data.overdueTotal).toBe(5);
    expect(far.body.data.items).toEqual([]);
  });

  it("is limited to Admin, Manager and Compliance, and Compliance sees only their own tasks", async () => {
    for (const who of [sam, alex]) expect((await get(who, "2025-11-01", "2025-11-30")).status).toBe(403);
    expect((await api(t).get("/api/v1/calendar?from=2025-11-01&to=2025-11-30")).status).toBe(401);
    const other = await makeUser(t.prisma, { email: "comp2@test.dev", name: "Cora Compliance", role: "COMPLIANCE" });
    const res = await get(other, "2025-11-01", "2025-11-30");
    expect(res.body.data.items.map((i: { kind: string }) => i.kind)).not.toContain("task");
    expect(res.body.data.items.map((i: { kind: string }) => i.kind)).toContain("filing");
  });

  it("validates the dates", async () => {
    expect((await as(ada).get("/api/v1/calendar")).body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["from", "to"]);
    expect((await get(ada, "2025-11-30", "2025-11-01")).body.errors).toEqual([{ field: "to", message: "to can't be before from." }]);
    expect((await get(ada, "2026-01-01", "2027-12-31")).status).toBe(422);
    expect((await get(ada, "2026-02-30", "2026-03-01")).body.errors[0].field).toBe("from");
  });

  it("hides a removed client's work", async () => {
    await t.prisma.case.updateMany({ where: { clientId: alex.id }, data: { deletedAt: new Date() } });
    await t.prisma.user.update({ where: { id: alex.id }, data: { deletedAt: new Date(), status: "REMOVED" } });
    expect((await get(ada, "2025-11-01", "2025-11-30")).body.data.items).toEqual([]);
  });
});
