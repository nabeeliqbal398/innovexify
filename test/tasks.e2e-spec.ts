import { api, bearerFor, createAppWithMail, dayOffset, makeCase, makeDocument, makeTask, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

type User = Awaited<ReturnType<typeof makeUser>>;
type CaseRow = Awaited<ReturnType<typeof makeCase>>;

describe("tasks (e2e)", () => {
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
  let compliance: User; // owns case1
  let compliance2: User; // owns nothing
  let client1: User; // csr1's
  let client2: User; // csr2's
  let case1: CaseRow;
  let case2: CaseRow;

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    t.mail.sent = [];
    admin = await makeUser(t.prisma, { email: "admin@test.dev", name: "Ada Admin", role: "ADMIN" });
    manager = await makeUser(t.prisma, { email: "manager@test.dev", name: "Max Manager", role: "MANAGER" });
    csr1 = await makeUser(t.prisma, { email: "csr1@test.dev", name: "Cora CSR", role: "CSR" });
    csr2 = await makeUser(t.prisma, { email: "csr2@test.dev", name: "Carl CSR", role: "CSR" });
    compliance = await makeUser(t.prisma, { email: "comp@test.dev", name: "Cleo Compliance", role: "COMPLIANCE" });
    compliance2 = await makeUser(t.prisma, { email: "comp2@test.dev", name: "Omar Compliance", role: "COMPLIANCE" });
    client1 = await makeUser(t.prisma, { email: "client1@test.dev", name: "Alex Client", role: "CLIENT", csrId: csr1.id });
    client2 = await makeUser(t.prisma, { email: "client2@test.dev", name: "Bea Client", role: "CLIENT", csrId: csr2.id });
    case1 = await makeCase(t.prisma, { clientId: client1.id, ownerId: compliance.id });
    case2 = await makeCase(t.prisma, { clientId: client2.id });
  });

  const as = (user: { id: string; role: Parameters<typeof bearerFor>[1]["role"] }) => api(t, bearerFor(t, user));
  const ids = async (who: User, query = ""): Promise<string[]> => (await as(who).get(`/api/v1/tasks${query}`)).body.data.map((x: { id: string }) => x.id);

  describe("scope", () => {
    let internal1: { id: string };
    let forClient1: { id: string };
    let task2: { id: string };
    let byCompliance: { id: string };
    beforeEach(async () => {
      internal1 = await makeTask(t.prisma, { caseId: case1.id, createdById: admin.id, assigneeId: manager.id, title: "Internal on case 1" });
      forClient1 = await makeTask(t.prisma, { caseId: case1.id, createdById: admin.id, assigneeId: manager.id, title: "Upload your passport", visibility: "CLIENT" });
      task2 = await makeTask(t.prisma, { caseId: case2.id, createdById: admin.id, assigneeId: manager.id, title: "Internal on case 2", visibility: "CLIENT" });
      byCompliance = await makeTask(t.prisma, { caseId: case2.id, createdById: compliance2.id, assigneeId: compliance2.id, title: "Compliance check", type: "COMPLIANCE" });
    });

    it("shows Admin and Manager every task", async () => {
      for (const who of [admin, manager]) expect((await ids(who)).sort()).toEqual([internal1.id, forClient1.id, task2.id, byCompliance.id].sort());
    });

    it("shows a CSR only the tasks on their own clients' cases, and 404 for another CSR's", async () => {
      expect((await ids(csr1)).sort()).toEqual([internal1.id, forClient1.id].sort());
      const other = await as(csr1).get(`/api/v1/tasks/${task2.id}`);
      expect(other.status).toBe(404);
      expect(other.body.errorCode).toBe("RESOURCE_NOT_FOUND");
      expect((await as(csr1).get(`/api/v1/tasks/${internal1.id}`)).status).toBe(200);
      expect((await ids(csr1, `?caseId=${case2.id}`))).toEqual([]);
    });

    it("shows a client only the tasks marked for them, on their own case", async () => {
      expect(await ids(client1)).toEqual([forClient1.id]);
      for (const hidden of [internal1.id, task2.id]) {
        const res = await as(client1).get(`/api/v1/tasks/${hidden}`);
        expect(res.status).toBe(404);
      }
      expect((await as(client1).get(`/api/v1/tasks/${forClient1.id}`)).body.data.title).toBe("Upload your passport");
      expect(await ids(client2)).toEqual([task2.id]);
    });

    it("shows Compliance the tasks assigned to them, created by them, or on a case they own, not the whole list", async () => {
      expect((await ids(compliance)).sort()).toEqual([internal1.id, forClient1.id].sort()); // owns case 1
      expect(await ids(compliance2)).toEqual([byCompliance.id]); // assigned and created by them
    });

    it("hides the tasks of a case that was removed with its client", async () => {
      await t.prisma.case.update({ where: { id: case1.id }, data: { deletedAt: new Date() } });
      expect(await ids(admin)).not.toContain(internal1.id);
      expect((await as(admin).get(`/api/v1/tasks/${internal1.id}`)).status).toBe(404);
    });

    it("requires a signed-in user", async () => {
      expect((await api(t).get("/api/v1/tasks")).status).toBe(401);
    });
  });

  describe("create", () => {
    const body = (extra: Record<string, unknown> = {}) => ({ caseId: case1.id, title: "Call the registered agent", due: "2030-06-30", ...extra });

    it("lets a Manager assign any active staff member and derives the type from who does the work", async () => {
      const res = await as(manager).post("/api/v1/tasks").send(body({ assigneeId: compliance.id, priority: "HIGH" }));
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        title: "Call the registered agent",
        type: "COMPLIANCE",
        visibility: "INTERNAL",
        priority: "HIGH",
        due: "2030-06-30",
        done: false,
        overdue: false,
        assignee: { id: compliance.id },
        createdBy: { id: manager.id },
        case: { id: case1.id, displayNumber: `PRJ-${case1.number}`, client: { id: client1.id } },
      });
      const toCsr = await as(manager).post("/api/v1/tasks").send(body({ assigneeId: csr1.id, title: "Follow up with Alex" }));
      expect(toCsr.body.data.type).toBe("CSR_FOLLOW_UP");
      const toAdmin = await as(manager).post("/api/v1/tasks").send(body({ assigneeId: admin.id, title: "Approve fee waiver" }));
      expect(toAdmin.body.data.type).toBe("OPERATIONS");

      expect(await t.prisma.notification.count({ where: { userId: compliance.id, text: "Task assigned to you: Call the registered agent" } })).toBe(1);
      const audit = await t.prisma.auditLog.findFirst({ where: { action: "Created task “Call the registered agent” for Cleo Compliance" } });
      expect(audit).toMatchObject({ actorId: manager.id, category: "cases" });
    });

    it("tells the client about a task marked for them, and nobody else's client", async () => {
      const res = await as(admin).post("/api/v1/tasks").send(body({ assigneeId: csr1.id, title: "Send your EIN letter", visibility: "CLIENT" }));
      expect(res.status).toBe(201);
      expect(res.body.message).toBe("Task added and visible to the client.");
      expect(await t.prisma.notification.count({ where: { userId: client1.id, text: "New task: Send your EIN letter" } })).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: client2.id } })).toBe(0);
    });

    it("makes Admin and Manager choose a due date, and gives a CSR or Compliance user three days by default", async () => {
      const missing = await as(manager).post("/api/v1/tasks").send({ caseId: case1.id, title: "No date" });
      expect(missing.status).toBe(422);
      expect(missing.body.errors).toEqual([{ field: "due", message: "Choose a due date." }]);

      const mine = await as(csr1).post("/api/v1/tasks").send({ caseId: case1.id, title: "Call Alex back" });
      expect(mine.status).toBe(201);
      expect(mine.body.data).toMatchObject({ due: dayOffset(3), assignee: { id: csr1.id }, type: "CSR_FOLLOW_UP" });
      const comp = await as(compliance).post("/api/v1/tasks").send({ caseId: case1.id, title: "Review the name" });
      expect(comp.status).toBe(201);
      expect(comp.body.data).toMatchObject({ type: "COMPLIANCE", assignee: { id: compliance.id } });
    });

    it("lets a CSR or Compliance user assign only to themselves", async () => {
      for (const [who, other, role] of [[csr1, manager, "a CSR"], [compliance, csr1, "a Compliance user"]] as const) {
        const res = await as(who).post("/api/v1/tasks").send(body({ assigneeId: other.id }));
        expect(res.status).toBe(403);
        expect(res.body.errorCode).toBe("TASK_ASSIGNEE_NOT_ALLOWED");
        expect(res.body.message).toBe(`As ${role} you can give tasks to yourself only. Ask an Admin or Manager to assign it to someone else.`);
      }
    });

    it("refuses an assignee who is a client, suspended, removed or unknown", async () => {
      const suspended = await makeUser(t.prisma, { email: "sus@test.dev", name: "Sam", role: "CSR", status: "SUSPENDED" });
      const removed = await makeUser(t.prisma, { email: "rem@test.dev", name: "Rem", role: "CSR", status: "REMOVED" });
      await t.prisma.user.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });
      for (const assigneeId of [client1.id, suspended.id, removed.id, "nobody"]) {
        const res = await as(manager).post("/api/v1/tasks").send(body({ assigneeId }));
        expect(res.status).toBe(422);
        expect(res.body).toMatchObject({ errorCode: "INVALID_TASK_ASSIGNEE", errors: [{ field: "assigneeId", message: "Choose an active staff member." }] });
      }
    });

    it("validates the due date: a real ISO date, and not before 2020", async () => {
      const early = await as(manager).post("/api/v1/tasks").send(body({ due: "2019-12-31", assigneeId: csr1.id }));
      expect(early.status).toBe(422);
      expect(early.body.errorCode).toBe("TASK_DUE_DATE_INVALID");
      expect(early.body.message).toBe("2019-12-31 is too far in the past to be a due date. Choose a date from 1 January 2020 onwards.");
      expect((await as(manager).post("/api/v1/tasks").send(body({ due: "2020-01-01", assigneeId: csr1.id }))).status).toBe(201);
      for (const due of ["30/06/2030", "2030-02-30", "tomorrow", "2030-6-1"]) {
        const bad = await as(manager).post("/api/v1/tasks").send(body({ due }));
        expect(bad.status).toBe(422);
        expect(bad.body.errorCode).toBe("VALIDATION_FAILED");
        expect(bad.body.errors[0].field).toBe("due");
      }
      expect(await t.prisma.task.count()).toBe(1);
    });

    it("rejects a new task on a completed case, with CASE_COMPLETED", async () => {
      await t.prisma.case.update({ where: { id: case1.id }, data: { stage: "COMPLETED", status: "COMPLETED", completedAt: new Date() } });
      const res = await as(manager).post("/api/v1/tasks").send(body({ assigneeId: csr1.id }));
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe("CASE_COMPLETED");
      expect(res.body.message).toBe(`PRJ-${case1.number} is completed, so no new tasks can be added to it. Open a new case if there is more work to do.`);
      expect(await t.prisma.task.count()).toBe(0);
    });

    it("rejects a new task on a removed case", async () => {
      await t.prisma.case.update({ where: { id: case1.id }, data: { deletedAt: new Date() } });
      expect((await as(manager).post("/api/v1/tasks").send(body({ assigneeId: csr1.id }))).body.errorCode).toBe("CASE_DELETED");
    });

    it("blocks a task that only repeats an open document request, naming the request", async () => {
      await makeDocument(t.prisma, { clientId: client1.id, name: "Proof of address (utility bill)", status: "REQUESTED" });
      const dup = await as(manager).post("/api/v1/tasks").send(body({ title: "Upload proof of address", assigneeId: csr1.id }));
      expect(dup.status).toBe(409);
      expect(dup.body.errorCode).toBe("DUPLICATE_DOCUMENT_REQUEST");
      expect(dup.body.message).toBe('"Proof of address (utility bill)" is already requested from this client in Documents. Follow up on that request instead of adding a duplicate task.');
      // A request that is already approved isn't open, so it doesn't block.
      await t.prisma.document.updateMany({ where: { clientId: client1.id }, data: { status: "APPROVED" } });
      expect((await as(manager).post("/api/v1/tasks").send(body({ title: "Upload proof of address", assigneeId: csr1.id }))).status).toBe(201);
    });

    it("keeps a CSR to their own clients' cases, and refuses clients and unknown cases", async () => {
      expect((await as(csr1).post("/api/v1/tasks").send({ caseId: case2.id, title: "Snooping" })).status).toBe(404);
      expect((await as(manager).post("/api/v1/tasks").send(body({ caseId: "nope", assigneeId: csr1.id }))).status).toBe(404);
      const client = await as(client1).post("/api/v1/tasks").send({ caseId: case1.id, title: "Do my own task" });
      expect(client.status).toBe(403);
      expect(client.body.message).toBe("Tasks marked for you are there to keep you informed. Your team creates and completes them.");
      expect(await t.prisma.task.count()).toBe(0);
    });

    it("validates the fields", async () => {
      const res = await as(manager).post("/api/v1/tasks").send({ title: "x".repeat(201), priority: "SOON", visibility: "SECRET", extra: 1 });
      expect(res.status).toBe(422);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          { field: "caseId", message: "Link the task to a case." },
          { field: "title", message: "The title can't be longer than 200 characters." },
          { field: "priority", message: expect.stringContaining("priority must be one of") },
          { field: "visibility", message: expect.stringContaining("visibility must be one of") },
          { field: "extra", message: "property extra should not exist" },
        ]),
      );
      expect((await as(manager).post("/api/v1/tasks").send({ caseId: case1.id, title: "   ", due: "2030-01-01" })).body.errors[0]).toEqual({ field: "title", message: "Enter a task title." });
    });
  });

  describe("edit", () => {
    let task: { id: string };
    beforeEach(async () => {
      task = await makeTask(t.prisma, { caseId: case1.id, createdById: admin.id, assigneeId: csr1.id, title: "Original", due: "2030-03-01" });
    });

    it("lets Admin and Manager change title, due date, priority, assignee and visibility", async () => {
      const res = await as(manager).patch(`/api/v1/tasks/${task.id}`).send({ title: "Renamed", due: "2030-04-15", priority: "URGENT", assigneeId: compliance.id, visibility: "CLIENT" });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ title: "Renamed", due: "2030-04-15", priority: "URGENT", visibility: "CLIENT", type: "COMPLIANCE", assignee: { id: compliance.id } });
      expect(await t.prisma.notification.count({ where: { userId: compliance.id, text: "Task assigned to you: Renamed" } })).toBe(1);
      expect((await t.prisma.auditLog.findFirst({ where: { action: { startsWith: "Edited task “Original”" } } }))?.actorId).toBe(manager.id);
    });

    it("refuses everyone else, a client included, with the rule's message", async () => {
      for (const who of [csr1, compliance, client1]) {
        const res = await as(who).patch(`/api/v1/tasks/${task.id}`).send({ title: "Mine now" });
        expect([403, 404]).toContain(res.status);
      }
      const res = await as(csr1).patch(`/api/v1/tasks/${task.id}`).send({ title: "Mine now" });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Only Admin and Manager can assign or edit any task.");
      expect((await t.prisma.task.findUniqueOrThrow({ where: { id: task.id } })).title).toBe("Original");
    });

    it("never lets a client edit a task marked for them", async () => {
      await t.prisma.task.update({ where: { id: task.id }, data: { visibility: "CLIENT" } });
      const res = await as(client1).patch(`/api/v1/tasks/${task.id}`).send({ title: "Done already" });
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe("PERMISSION_DENIED");
      expect((await as(client1).post(`/api/v1/tasks/${task.id}/complete`).send()).status).toBe(403);
      expect((await as(client1).delete(`/api/v1/tasks/${task.id}`)).status).toBe(403);
      expect(await t.prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ title: "Original", done: false });
    });

    it("refuses an empty change, an invalid assignee and an early date, and writes nothing for an unchanged value", async () => {
      expect((await as(manager).patch(`/api/v1/tasks/${task.id}`).send({})).body.errors).toEqual([{ field: "body", message: "Send at least one field to change." }]);
      expect((await as(manager).patch(`/api/v1/tasks/${task.id}`).send({ assigneeId: client1.id })).body.errorCode).toBe("INVALID_TASK_ASSIGNEE");
      expect((await as(manager).patch(`/api/v1/tasks/${task.id}`).send({ due: "2001-01-01" })).body.errorCode).toBe("TASK_DUE_DATE_INVALID");
      const before = await t.prisma.auditLog.count();
      const same = await as(manager).patch(`/api/v1/tasks/${task.id}`).send({ title: "Original" });
      expect(same.status).toBe(200);
      expect(await t.prisma.auditLog.count()).toBe(before);
    });
  });

  describe("complete and reopen", () => {
    let task: { id: string };
    beforeEach(async () => {
      task = await makeTask(t.prisma, { caseId: case1.id, createdById: admin.id, assigneeId: csr1.id, title: "Chase the signature" });
    });

    it("records who completed it and when, and clears that on reopen", async () => {
      const done = await as(csr1).post(`/api/v1/tasks/${task.id}/complete`).send();
      expect(done.status).toBe(200);
      expect(done.body.message).toBe("Task completed.");
      expect(done.body.data).toMatchObject({ done: true, completedBy: { id: csr1.id, name: "Cora CSR" } });
      expect(done.body.data.completedAt).not.toBeNull();
      expect(await t.prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ done: true, completedById: csr1.id });

      const reopened = await as(csr1).post(`/api/v1/tasks/${task.id}/reopen`).send();
      expect(reopened.status).toBe(200);
      expect(reopened.body.message).toBe("Task reopened.");
      expect(reopened.body.data).toMatchObject({ done: false, completedBy: null, completedAt: null });
    });

    it("is idempotent: completing twice changes nothing and says so", async () => {
      const first = await as(csr1).post(`/api/v1/tasks/${task.id}/complete`).send();
      const second = await as(manager).post(`/api/v1/tasks/${task.id}/complete`).send();
      expect(second.status).toBe(200);
      expect(second.body.message).toBe("This task was already completed by Cora CSR. Nothing was changed.");
      // Still credited to the first person, at the first moment.
      expect(second.body.data.completedBy.id).toBe(csr1.id);
      expect(second.body.data.completedAt).toBe(first.body.data.completedAt);
      expect(await t.prisma.auditLog.count({ where: { action: { startsWith: "Completed task" } } })).toBe(1);
    });

    it("is idempotent: reopening an open task changes nothing and says so", async () => {
      const res = await as(csr1).post(`/api/v1/tasks/${task.id}/reopen`).send();
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("This task is already open. Nothing was changed.");
      expect(await t.prisma.auditLog.count({ where: { action: { startsWith: "Reopened task" } } })).toBe(0);
    });

    it("credits exactly one person when two complete it at the same moment", async () => {
      const [a, b] = await Promise.all([as(csr1).post(`/api/v1/tasks/${task.id}/complete`).send(), as(manager).post(`/api/v1/tasks/${task.id}/complete`).send()]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect([a.body.message, b.body.message].filter((m: string) => m === "Task completed.")).toHaveLength(1);
      expect(await t.prisma.auditLog.count({ where: { action: { startsWith: "Completed task" } } })).toBe(1);
    });

    it("follows the roles: a CSR for their own clients, Compliance for compliance work, Admin and Manager for any, not a CSR for another's", async () => {
      expect((await as(compliance).post(`/api/v1/tasks/${task.id}/complete`).send()).status).toBe(200); // owns case 1
      const other = await makeTask(t.prisma, { caseId: case2.id, createdById: admin.id, assigneeId: manager.id });
      expect((await as(csr1).post(`/api/v1/tasks/${other.id}/complete`).send()).status).toBe(404);
      expect((await as(admin).post(`/api/v1/tasks/${other.id}/complete`).send()).status).toBe(200);
      expect((await as(csr1).post("/api/v1/tasks/nope/complete").send()).status).toBe(404);
    });

    it("computes overdue on the server and drops it once done", async () => {
      const late = await makeTask(t.prisma, { caseId: case1.id, createdById: admin.id, assigneeId: csr1.id, title: "Late", due: dayOffset(-2) });
      const before = await as(csr1).get(`/api/v1/tasks/${late.id}`);
      expect(before.body.data).toMatchObject({ due: dayOffset(-2), overdue: true });
      const done = await as(csr1).post(`/api/v1/tasks/${late.id}/complete`).send();
      expect(done.body.data.overdue).toBe(false);
    });
  });

  describe("delete", () => {
    it("lets the creator, an Admin or a Manager delete, and refuses anyone else with an audited refusal", async () => {
      const mine = await makeTask(t.prisma, { caseId: case1.id, createdById: csr1.id, assigneeId: csr1.id, title: "My own" });
      const notMine = await makeTask(t.prisma, { caseId: case1.id, createdById: admin.id, assigneeId: csr1.id, title: "Set by Ada" });

      const refused = await as(csr1).delete(`/api/v1/tasks/${notMine.id}`);
      expect(refused.status).toBe(403);
      expect(refused.body).toMatchObject({ errorCode: "TASK_DELETE_NOT_ALLOWED", message: "Only the person who created a task, or an Admin or Manager, can delete it." });
      expect(await t.prisma.task.count({ where: { id: notMine.id } })).toBe(1);
      expect(await t.prisma.auditLog.count({ where: { action: "Refused: delete task Set by Ada", ok: false, actorId: csr1.id } })).toBe(1);

      expect((await as(csr1).delete(`/api/v1/tasks/${mine.id}`)).status).toBe(200);
      expect(await t.prisma.task.count({ where: { id: mine.id } })).toBe(0);
      expect((await as(manager).delete(`/api/v1/tasks/${notMine.id}`)).status).toBe(200);
      expect(await t.prisma.auditLog.count({ where: { action: { startsWith: "Deleted task" } } })).toBe(2);
    });

    it("lets an Admin delete a completed task, and returns 404 for one outside the scope", async () => {
      const done = await makeTask(t.prisma, { caseId: case1.id, createdById: csr1.id, assigneeId: csr1.id, done: true });
      expect((await as(csr2).delete(`/api/v1/tasks/${done.id}`)).status).toBe(404);
      expect((await as(admin).delete(`/api/v1/tasks/${done.id}`)).status).toBe(200);
    });
  });

  describe("list", () => {
    let overdue: { id: string };
    let today: { id: string };
    let soon: { id: string };
    let later: { id: string };
    let done: { id: string };
    beforeEach(async () => {
      overdue = await makeTask(t.prisma, { caseId: case1.id, createdById: admin.id, assigneeId: csr1.id, title: "Overdue filing note", due: dayOffset(-3), priority: "HIGH", type: "CSR_FOLLOW_UP" });
      today = await makeTask(t.prisma, { caseId: case1.id, createdById: admin.id, assigneeId: manager.id, title: "Due today", due: dayOffset(0), priority: "LOW" });
      soon = await makeTask(t.prisma, { caseId: case1.id, createdById: admin.id, assigneeId: csr1.id, title: "Due in five days", due: dayOffset(5), type: "COMPLIANCE" });
      later = await makeTask(t.prisma, { caseId: case1.id, createdById: admin.id, assigneeId: csr1.id, title: "Due next month", due: dayOffset(30) });
      done = await makeTask(t.prisma, { caseId: case1.id, createdById: admin.id, assigneeId: csr1.id, title: "Finished long ago", due: dayOffset(-10), done: true });
    });

    it("filters overdue, today, week and mine from the server's date", async () => {
      expect(await ids(admin, "?filter=overdue")).toEqual([overdue.id]); // a done task is never overdue
      expect(await ids(admin, "?filter=today")).toEqual([today.id]);
      expect((await ids(admin, "?filter=week&sort=due")).sort()).toEqual([today.id, soon.id].sort());
      expect((await ids(csr1, "?filter=mine")).sort()).toEqual([overdue.id, soon.id, later.id, done.id].sort());
      expect(await ids(manager, "?filter=mine")).toEqual([today.id]);
      expect(await ids(admin, "?filter=overdue&done=true")).toEqual([]);
    });

    it("filters by case, assignee, type, priority and done", async () => {
      await makeTask(t.prisma, { caseId: case2.id, createdById: admin.id, assigneeId: csr2.id, title: "Elsewhere" });
      expect(await ids(admin, `?caseId=${case2.id}`)).toHaveLength(1);
      expect((await ids(admin, `?assigneeId=${manager.id}`))).toEqual([today.id]);
      expect(await ids(admin, "?type=COMPLIANCE")).toEqual([soon.id]);
      expect(await ids(admin, "?priority=HIGH")).toEqual([overdue.id]);
      expect(await ids(admin, "?done=true")).toEqual([done.id]);
      expect((await ids(admin, `?done=false&caseId=${case1.id}`)).sort()).toEqual([overdue.id, today.id, soon.id, later.id].sort());
    });

    it("searches title, client name and case number", async () => {
      expect(await ids(admin, "?search=next%20month")).toEqual([later.id]);
      expect((await ids(admin, "?search=alex")).length).toBe(5);
      expect((await ids(admin, `?search=PRJ-${case1.number}`)).length).toBe(5);
      expect(await ids(admin, "?search=zzzz")).toEqual([]);
    });

    it("sorts by due date by default, and by the fields it offers", async () => {
      expect(await ids(admin)).toEqual([done.id, overdue.id, today.id, soon.id, later.id]);
      expect(await ids(admin, "?sort=due&order=desc")).toEqual([later.id, soon.id, today.id, overdue.id, done.id]);
      expect((await ids(admin, "?sort=priority&order=desc"))[0]).toBe(overdue.id);
      const bad = await as(admin).get("/api/v1/tasks?sort=assigneeId");
      expect(bad.status).toBe(422);
      expect(bad.body.errors).toEqual([{ field: "sort", message: "You can sort by due, priority, title, createdAt, done." }]);
    });

    it("marks overdue on each row and paginates, rejecting bad paging with a message on the field", async () => {
      const res = await as(admin).get("/api/v1/tasks?limit=2&page=1");
      expect(res.body.meta).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });
      const all = (await as(admin).get("/api/v1/tasks")).body.data as Array<{ id: string; overdue: boolean }>;
      expect(Object.fromEntries(all.map((x) => [x.id, x.overdue]))).toEqual({ [done.id]: false, [overdue.id]: true, [today.id]: false, [soon.id]: false, [later.id]: false });

      const bad = await as(admin).get("/api/v1/tasks?page=0&limit=101&filter=yesterday&done=maybe&type=NOPE");
      expect(bad.status).toBe(422);
      expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["done", "filter", "limit", "page", "type"]);
    });
  });

  describe("open tasks and removing or suspending a user", () => {
    it("blocks removing a CSR who has open tasks, counting them, and allows it once they are handed over", async () => {
      await makeTask(t.prisma, { caseId: case2.id, createdById: admin.id, assigneeId: csr1.id, title: "One" });
      const open2 = await makeTask(t.prisma, { caseId: case2.id, createdById: admin.id, assigneeId: csr1.id, title: "Two" });
      await makeTask(t.prisma, { caseId: case2.id, createdById: admin.id, assigneeId: csr1.id, title: "Finished", done: true });
      // csr1 also has client1; move that client away so only tasks block.
      await t.prisma.clientProfile.update({ where: { userId: client1.id }, data: { csrId: csr2.id } });

      const blocked = await as(admin).delete(`/api/v1/users/${csr1.id}`);
      expect(blocked.status).toBe(409);
      expect(blocked.body.errorCode).toBe("REASSIGNMENT_REQUIRED");
      expect(blocked.body.message).toContain("2 open tasks");
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: csr1.id } })).status).toBe("ACTIVE");

      // Hand the tasks over with the new edit route, then it works.
      for (const task of await t.prisma.task.findMany({ where: { assigneeId: csr1.id, done: false } })) {
        expect((await as(manager).patch(`/api/v1/tasks/${task.id}`).send({ assigneeId: csr2.id })).status).toBe(200);
      }
      expect(open2.id).toBeDefined();
      expect((await as(admin).delete(`/api/v1/users/${csr1.id}`)).status).toBe(200);
    });

    it("blocks removing any staff member with open tasks, not only a CSR", async () => {
      await makeTask(t.prisma, { caseId: case1.id, createdById: admin.id, assigneeId: compliance2.id, title: "Compliance work", type: "COMPLIANCE" });
      const res = await as(admin).delete(`/api/v1/users/${compliance2.id}`);
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe("REASSIGNMENT_REQUIRED");
      expect(res.body.message).toContain("1 open task");
    });

    it("does not block suspending someone with open tasks (a compromised account must be stoppable at once)", async () => {
      await makeTask(t.prisma, { caseId: case1.id, createdById: admin.id, assigneeId: csr1.id });
      const res = await as(manager).patch(`/api/v1/users/${csr1.id}/status`).send({ status: "SUSPENDED" });
      expect(res.status).toBe(200);
    });
  });
});
