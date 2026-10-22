import { CasesRepository } from "../src/modules/cases/repository/cases.repository";
import { api, bearerFor, createAppWithMail, makeCase, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

type User = Awaited<ReturnType<typeof makeUser>>;
type CaseRow = Awaited<ReturnType<typeof makeCase>>;

describe("cases (e2e)", () => {
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
  let case1: CaseRow;
  let case2: CaseRow;

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    t.mail.sent = [];
    t.mail.failWith = null;
    admin = await makeUser(t.prisma, { email: "admin@test.dev", name: "Ada Admin", role: "ADMIN" });
    manager = await makeUser(t.prisma, { email: "manager@test.dev", name: "Max Manager", role: "MANAGER" });
    csr1 = await makeUser(t.prisma, { email: "csr1@test.dev", name: "Cora CSR", role: "CSR" });
    csr2 = await makeUser(t.prisma, { email: "csr2@test.dev", name: "Carl CSR", role: "CSR" });
    compliance = await makeUser(t.prisma, { email: "comp@test.dev", name: "Cleo Compliance", role: "COMPLIANCE" });
    client1 = await makeUser(t.prisma, { email: "client1@test.dev", name: "Alex Client", role: "CLIENT", csrId: csr1.id });
    client2 = await makeUser(t.prisma, { email: "client2@test.dev", name: "Bea Client", role: "CLIENT", csrId: csr2.id });
    await t.prisma.clientProfile.update({ where: { userId: client1.id }, data: { businessName: "Northfield Studio LLC", formationState: "Wyoming" } });
    await t.prisma.clientProfile.update({ where: { userId: client2.id }, data: { businessName: "Bluewater Analytics LLC", formationState: "Delaware" } });
    case1 = await makeCase(t.prisma, { clientId: client1.id, ownerId: compliance.id });
    case2 = await makeCase(t.prisma, { clientId: client2.id });
  });

  const as = (user: { id: string; role: Parameters<typeof bearerFor>[1]["role"] }) => api(t, bearerFor(t, user));
  const stage = (who: User, id: string, body: Record<string, unknown>) => as(who).post(`/api/v1/cases/${id}/stage`).send(body);
  const fresh = (id: string) => t.prisma.case.findUniqueOrThrow({ where: { id } });
  /** Puts a case at a stage straight in the database (and bumps nothing else), to start a test mid-workflow. */
  const setStage = (id: string, stageName: Parameters<typeof makeCase>[1]["stage"], extra: Record<string, unknown> = {}) =>
    t.prisma.case.update({ where: { id }, data: { stage: stageName, ...extra } });

  describe("stage workflow", () => {
    it("moves one stage forward: derives the status, bumps the version, writes the event, notifies and audits", async () => {
      const before = await fresh(case1.id);
      const res = await stage(admin, case1.id, { targetStage: "CLIENT_ONBOARDING", version: 1, note: "Welcome call done" });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: case1.id, stage: "CLIENT_ONBOARDING", status: "AWAITING_CLIENT", version: 2, completedAt: null });

      const after = await fresh(case1.id);
      expect(after.version).toBe(2);
      expect(after.lastActivityAt.getTime()).toBeGreaterThan(before.lastActivityAt.getTime());

      const events = await t.prisma.caseEvent.findMany({ where: { caseId: case1.id } });
      expect(events).toMatchObject([{ toStage: "CLIENT_ONBOARDING", byId: admin.id, note: "Welcome call done" }]);

      // The client and the case owner are told; the person who moved it is not.
      expect(await t.prisma.notification.findMany({ where: { userId: client1.id }, select: { text: true, link: true } })).toEqual([
        { text: "Your formation moved to “Client Onboarding”", link: "home" },
      ]);
      expect(await t.prisma.notification.count({ where: { userId: compliance.id, text: `PRJ-${case1.number} moved to “Client Onboarding”` } })).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: admin.id } })).toBe(0);

      const audit = await t.prisma.auditLog.findFirst({ where: { action: `Moved PRJ-${case1.number} from Invitation Sent to Client Onboarding` } });
      expect(audit).toMatchObject({ actorId: admin.id, category: "cases", ok: true });
    });

    it("derives the status from the stage and keeps On Hold and Blocked", async () => {
      await setStage(case1.id, "DOCUMENTS_PENDING");
      const toReview = await stage(admin, case1.id, { targetStage: "DOCUMENTS_UNDER_REVIEW", version: 1 });
      expect(toReview.body.data.status).toBe("ACTIVE");

      await setStage(case2.id, "INFORMATION_REQUIRED", { status: "BLOCKED" });
      const blocked = await stage(admin, case2.id, { targetStage: "DOCUMENTS_PENDING", version: 1 });
      expect(blocked.status).toBe(200);
      expect(blocked.body.data.status).toBe("BLOCKED");
    });

    it("rejects skipping a stage with INVALID_STATE_TRANSITION naming the current and target stage", async () => {
      const res = await stage(admin, case1.id, { targetStage: "INFORMATION_REQUIRED", version: 1 });
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe("INVALID_STATE_TRANSITION");
      expect(res.body.message).toBe('A case can\'t move from "Invitation Sent" to "Information Required". Stages are completed in order, so the next one is "Client Onboarding".');
      expect((await fresh(case1.id)).stage).toBe("INVITATION_SENT");
      expect(await t.prisma.caseEvent.count({ where: { caseId: case1.id } })).toBe(0);
    });

    it("rejects 'moving' to the stage it is already in", async () => {
      const res = await stage(admin, case1.id, { targetStage: "INVITATION_SENT", version: 1 });
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe("INVALID_STATE_TRANSITION");
      expect(res.body.message).toContain("already in that stage");
    });

    it("rejects a backward move for roles that may not roll back, naming both stages", async () => {
      await setStage(case1.id, "READY_FOR_FILING");
      const res = await stage(compliance, case1.id, { targetStage: "DOCUMENTS_UNDER_REVIEW", version: 1, note: "Wrong documents" });
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe("INVALID_STATE_TRANSITION");
      expect(res.body.message).toContain('"Ready for Filing" to "Documents Under Review"');
      expect(res.body.message).toContain("Ask an Admin or Manager to roll it back");
      expect((await fresh(case1.id)).stage).toBe("READY_FOR_FILING");
    });

    it("lets Admin and Manager roll a case back, but only with a reason", async () => {
      await setStage(case1.id, "READY_FOR_FILING");
      const noReason = await stage(manager, case1.id, { targetStage: "DOCUMENTS_PENDING", version: 1 });
      expect(noReason.status).toBe(422);
      expect(noReason.body.errorCode).toBe("ROLLBACK_REASON_REQUIRED");
      expect(noReason.body.errors).toEqual([{ field: "note", message: "Explain why the case is moving back." }]);
      expect((await fresh(case1.id)).stage).toBe("READY_FOR_FILING");

      const blank = await stage(manager, case1.id, { targetStage: "DOCUMENTS_PENDING", version: 1, note: "   " });
      expect(blank.body.errorCode).toBe("ROLLBACK_REASON_REQUIRED");

      const ok = await stage(manager, case1.id, { targetStage: "DOCUMENTS_PENDING", version: 1, note: "Passport scan was unreadable" });
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ stage: "DOCUMENTS_PENDING", status: "AWAITING_CLIENT", version: 2 });
      const event = await t.prisma.caseEvent.findFirstOrThrow({ where: { caseId: case1.id } });
      expect(event.note).toBe("Rolled back: Passport scan was unreadable");
      expect((await t.prisma.auditLog.findFirst({ where: { action: { contains: "Rolled back" } } }))?.action).toContain("reason: Passport scan was unreadable");
    });

    it("requires the state's confirmation number to move past State Approval, with its own error code", async () => {
      await setStage(case1.id, "STATE_APPROVAL_RECEIVED", { status: "ACTIVE" });
      const res = await stage(admin, case1.id, { targetStage: "EIN_PROCESSING", version: 1 });
      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe("FILING_NUMBER_REQUIRED");
      expect(res.body.message).toBe("A state approval can only be recorded with the state's own confirmation number. Enter it and try again.");
      expect(res.body.errors).toEqual([{ field: "filingConfirmation", message: "Enter the confirmation number issued by the state." }]);
      expect((await fresh(case1.id)).stage).toBe("STATE_APPROVAL_RECEIVED");

      const blank = await stage(admin, case1.id, { targetStage: "EIN_PROCESSING", version: 1, filingConfirmation: "   " });
      expect(blank.body.errorCode).toBe("FILING_NUMBER_REQUIRED");

      const ok = await stage(admin, case1.id, { targetStage: "EIN_PROCESSING", version: 1, filingConfirmation: "  WY-2026-0042  ", note: "Approved by the state" });
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ stage: "EIN_PROCESSING", filingConfirmation: "WY-2026-0042", version: 2 });
      expect((await t.prisma.caseEvent.findFirstOrThrow({ where: { caseId: case1.id } })).note).toBe("State confirmation WY-2026-0042 · Approved by the state");
    });

    it("does not ask again when a confirmation number is already on file, and ignores one it doesn't need", async () => {
      await setStage(case1.id, "STATE_APPROVAL_RECEIVED", { status: "ACTIVE", filingConfirmation: "WY-ON-FILE" });
      const ok = await stage(admin, case1.id, { targetStage: "EIN_PROCESSING", version: 1 });
      expect(ok.status).toBe(200);
      expect(ok.body.data.filingConfirmation).toBe("WY-ON-FILE");

      const early = await stage(admin, case2.id, { targetStage: "CLIENT_ONBOARDING", version: 1, filingConfirmation: "NOT-NEEDED-YET" });
      expect(early.status).toBe(200);
      expect(early.body.data.filingConfirmation).toBe("");
    });

    it("completes a case: sets completedAt and the Completed status, then refuses edits but still takes notes", async () => {
      await setStage(case1.id, "POST_FORMATION_DOCUMENTS", { status: "ACTIVE", filingConfirmation: "WY-1" });
      const done = await stage(admin, case1.id, { targetStage: "COMPLETED", version: 1 });
      expect(done.status).toBe(200);
      expect(done.body.data).toMatchObject({ stage: "COMPLETED", status: "COMPLETED" });
      expect(done.body.data.completedAt).not.toBeNull();

      const stageEdit = await stage(admin, case1.id, { targetStage: "POST_FORMATION_DOCUMENTS", version: 2, note: "Reopen" });
      expect(stageEdit.status).toBe(409);
      expect(stageEdit.body.errorCode).toBe("CASE_COMPLETED");
      expect(stageEdit.body.message).toBe(`PRJ-${case1.number} is completed, so it can't be edited or moved to another stage. You can still add notes to it.`);
      const patch = await as(admin).patch(`/api/v1/cases/${case1.id}`).send({ version: 2, priority: "HIGH" });
      expect(patch.status).toBe(409);
      expect(patch.body.errorCode).toBe("CASE_COMPLETED");

      const note = await as(csr1).post(`/api/v1/cases/${case1.id}/notes`).send({ text: "Client sent a thank-you" });
      expect(note.status).toBe(201);
    });

    it("keeps Compliance to the document stages: where the case is, and where it goes", async () => {
      await setStage(case1.id, "DOCUMENTS_PENDING");
      const ok = await stage(compliance, case1.id, { targetStage: "DOCUMENTS_UNDER_REVIEW", version: 1 });
      expect(ok.status).toBe(200);
      const ok2 = await stage(compliance, case1.id, { targetStage: "READY_FOR_FILING", version: 2 });
      expect(ok2.status).toBe(200);

      const tooFar = await stage(compliance, case1.id, { targetStage: "STATE_FILING_IN_PROGRESS", version: 3 });
      expect(tooFar.status).toBe(403);
      expect(tooFar.body.errorCode).toBe("PERMISSION_DENIED");
      expect(tooFar.body.message).toContain("Compliance can move document stages");

      await setStage(case2.id, "INFORMATION_REQUIRED");
      const wrongStart = await stage(compliance, case2.id, { targetStage: "DOCUMENTS_PENDING", version: 1 });
      expect(wrongStart.status).toBe(403);
      expect((await fresh(case2.id)).stage).toBe("INFORMATION_REQUIRED");
      expect((await t.prisma.auditLog.findFirst({ where: { action: "Refused: complianceMilestones", ok: false } }))?.actorId).toBe(compliance.id);
    });

    it("refuses a CSR and a client", async () => {
      for (const who of [csr1, client1]) {
        const res = await stage(who, case1.id, { targetStage: "CLIENT_ONBOARDING", version: 1 });
        expect(res.status).toBe(403);
        expect(res.body.errorCode).toBe("PERMISSION_DENIED");
      }
      expect((await fresh(case1.id)).stage).toBe("INVITATION_SENT");
    });

    it("returns 404 for a case that doesn't exist", async () => {
      const res = await stage(admin, "nope", { targetStage: "CLIENT_ONBOARDING", version: 1 });
      expect(res.status).toBe(404);
    });

    it("validates the body", async () => {
      const res = await stage(admin, case1.id, { targetStage: "NEXT", version: 0, note: "n".repeat(401), filingConfirmation: "f".repeat(65), extra: 1 });
      expect(res.status).toBe(422);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          { field: "targetStage", message: expect.stringContaining("Choose a stage") },
          { field: "version", message: expect.stringContaining("Send the version you loaded") },
          { field: "note", message: "The note can't be longer than 400 characters." },
          { field: "filingConfirmation", message: "The confirmation number can't be longer than 64 characters." },
          { field: "extra", message: "property extra should not exist" },
        ]),
      );
      const missing = await stage(admin, case1.id, {});
      expect(missing.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["targetStage", "version"]);
    });
  });

  describe("optimistic locking", () => {
    it("lets exactly one of two concurrent stage changes with the same version win", async () => {
      const [a, b] = await Promise.all([
        stage(admin, case1.id, { targetStage: "CLIENT_ONBOARDING", version: 1, note: "from Ada" }),
        stage(manager, case1.id, { targetStage: "CLIENT_ONBOARDING", version: 1, note: "from Max" }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const loser = a.status === 409 ? a : b;
      expect(loser.body.errorCode).toBe("CONCURRENT_MODIFICATION");
      expect(loser.body.message).toBe("Someone else changed this case while you were working on it, so your change was not saved. Refresh to see the latest version, then try again.");

      // The case moved once, not twice, and only the winner left a trace.
      const row = await fresh(case1.id);
      expect(row).toMatchObject({ stage: "CLIENT_ONBOARDING", version: 2 });
      expect(await t.prisma.caseEvent.count({ where: { caseId: case1.id } })).toBe(1);
      expect(await t.prisma.auditLog.count({ where: { action: { startsWith: `Moved PRJ-${case1.number}` } } })).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: client1.id } })).toBe(1);
    });

    it("lets the database decide when both requests have already read the same version", async () => {
      // Hold both requests after they have read the case, so each has seen version 1 and passed every check made
      // before the write. Only the guarded UPDATE (WHERE id AND version) can now tell them apart.
      const repo = t.app.get(CasesRepository);
      const original = repo.findOne.bind(repo);
      let arrived = 0;
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const spy = jest.spyOn(repo, "findOne").mockImplementation(async (...args) => {
        const record = await original(...args);
        if (++arrived === 2) release();
        await gate;
        return record;
      });
      try {
        const [a, b] = await Promise.all([
          stage(admin, case1.id, { targetStage: "CLIENT_ONBOARDING", version: 1, note: "from Ada" }),
          stage(manager, case1.id, { targetStage: "CLIENT_ONBOARDING", version: 1, note: "from Max" }),
        ]);
        expect(arrived).toBe(2);
        expect([a.status, b.status].sort()).toEqual([200, 409]);
        expect((a.status === 409 ? a : b).body.errorCode).toBe("CONCURRENT_MODIFICATION");
      } finally {
        spy.mockRestore();
      }
      expect(await fresh(case1.id)).toMatchObject({ stage: "CLIENT_ONBOARDING", version: 2 });
      expect(await t.prisma.caseEvent.count({ where: { caseId: case1.id } })).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: client1.id } })).toBe(1);
    });

    it("lets many concurrent changes through one at a time, never two at once", async () => {
      const results = await Promise.all(
        [admin, manager, admin, manager, admin].map((who, i) => stage(who, case1.id, { targetStage: "CLIENT_ONBOARDING", version: 1, note: `try ${i}` })),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409 && r.body.errorCode === "CONCURRENT_MODIFICATION")).toHaveLength(4);
      expect((await fresh(case1.id)).version).toBe(2);
    });

    it("refuses a stale version with CONCURRENT_MODIFICATION and changes nothing", async () => {
      expect((await stage(admin, case1.id, { targetStage: "CLIENT_ONBOARDING", version: 1 })).status).toBe(200);
      const stale = await stage(admin, case1.id, { targetStage: "INFORMATION_REQUIRED", version: 1 });
      expect(stale.status).toBe(409);
      expect(stale.body.errorCode).toBe("CONCURRENT_MODIFICATION");
      expect(stale.body.message).toContain("Refresh to see the latest version");
      expect((await fresh(case1.id)).stage).toBe("CLIENT_ONBOARDING");
      // The current version works.
      expect((await stage(admin, case1.id, { targetStage: "INFORMATION_REQUIRED", version: 2 })).status).toBe(200);
    });

    it("checks the version before the stage rules, because the rules depend on the state the user didn't see", async () => {
      await setStage(case1.id, "STATE_APPROVAL_RECEIVED", { version: 5 });
      const res = await stage(admin, case1.id, { targetStage: "EIN_PROCESSING", version: 4 });
      expect(res.body.errorCode).toBe("CONCURRENT_MODIFICATION");
    });

    it("uses the same version for field edits, and edits count as changes for a stage move", async () => {
      const edit = await as(admin).patch(`/api/v1/cases/${case1.id}`).send({ version: 1, priority: "URGENT" });
      expect(edit.status).toBe(200);
      expect(edit.body.data.version).toBe(2);
      const staleMove = await stage(admin, case1.id, { targetStage: "CLIENT_ONBOARDING", version: 1 });
      expect(staleMove.body.errorCode).toBe("CONCURRENT_MODIFICATION");
      const staleEdit = await as(admin).patch(`/api/v1/cases/${case1.id}`).send({ version: 1, priority: "LOW" });
      expect(staleEdit.body.errorCode).toBe("CONCURRENT_MODIFICATION");
    });

    it("only locks the one case: a change to another case isn't held up", async () => {
      const [a, b] = await Promise.all([
        stage(admin, case1.id, { targetStage: "CLIENT_ONBOARDING", version: 1 }),
        stage(admin, case2.id, { targetStage: "CLIENT_ONBOARDING", version: 1 }),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
    });
  });

  describe("notifications follow preferences", () => {
    it("skips the in-app notification and the email a user switched off", async () => {
      await t.prisma.notificationPreference.create({ data: { userId: client1.id, category: "STAGE", email: false, inApp: false } });
      await t.prisma.notificationPreference.create({ data: { userId: compliance.id, category: "STAGE", email: true, inApp: false } });
      const res = await stage(admin, case1.id, { targetStage: "CLIENT_ONBOARDING", version: 1 });
      expect(res.status).toBe(200);
      expect(await t.prisma.notification.count({ where: { userId: { in: [client1.id, compliance.id] } } })).toBe(0);
      expect(t.mail.sent.filter((m) => m.kind === "notification").map((m) => m.to)).toEqual(["comp@test.dev"]);
    });

    it("sends both by default, and the stage change still succeeds if the email can't be sent", async () => {
      const ok = await stage(admin, case1.id, { targetStage: "CLIENT_ONBOARDING", version: 1 });
      expect(ok.status).toBe(200);
      expect(t.mail.sent.filter((m) => m.kind === "notification").map((m) => m.to).sort()).toEqual(["client1@test.dev", "comp@test.dev"]);

      t.mail.failWith = new Error("SMTP is down");
      const stillOk = await stage(admin, case1.id, { targetStage: "INFORMATION_REQUIRED", version: 2 });
      expect(stillOk.status).toBe(200);
      expect((await fresh(case1.id)).stage).toBe("INFORMATION_REQUIRED");
    });

    it("does not notify the person who made the change", async () => {
      await stage(compliance, case1.id, { targetStage: "CLIENT_ONBOARDING", version: 1 }).catch(() => undefined);
      await setStage(case1.id, "DOCUMENTS_PENDING", { version: 1 });
      const res = await stage(compliance, case1.id, { targetStage: "DOCUMENTS_UNDER_REVIEW", version: 1 });
      expect(res.status).toBe(200);
      expect(await t.prisma.notification.count({ where: { userId: compliance.id } })).toBe(0);
      expect(await t.prisma.notification.count({ where: { userId: client1.id } })).toBe(1);
    });
  });

  describe("create", () => {
    let orphan: User;
    beforeEach(async () => {
      orphan = await makeUser(t.prisma, { email: "orphan@test.dev", name: "Olly Orphan", role: "CLIENT", csrId: csr2.id });
    });

    it("opens a case for a client who has none, with the next number, at the right stage", async () => {
      const res = await as(manager).post("/api/v1/cases").send({ clientId: orphan.id, serviceId: "corp", priority: "HIGH", deadline: "2027-05-01", businessName: "Orphan Corp", formationState: "Florida" });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        number: 101,
        displayNumber: "PRJ-101",
        stage: "CLIENT_ONBOARDING",
        status: "AWAITING_CLIENT",
        priority: "HIGH",
        deadline: "2027-05-01",
        version: 1,
        service: { id: "corp" },
        client: { id: orphan.id, businessName: "Orphan Corp", formationState: "Florida" },
      });
      expect((await t.prisma.counter.findUniqueOrThrow({ where: { key: "case" } })).value).toBe(101);
      expect(await t.prisma.caseEvent.findMany({ where: { caseId: res.body.data.id } })).toMatchObject([{ toStage: "CLIENT_ONBOARDING", note: "Case created" }]);
      expect(await t.prisma.notification.count({ where: { userId: orphan.id, text: "Your Corporation formation was opened" } })).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: csr2.id, text: "New case PRJ-101 for Olly Orphan" } })).toBe(1);
      expect(await t.prisma.auditLog.count({ where: { action: "Created case PRJ-101 for Olly Orphan" } })).toBe(1);
    });

    it("starts a client who hasn't accepted yet at Invitation Sent", async () => {
      const pending = await makeUser(t.prisma, { email: "pending@test.dev", name: "Pat Pending", role: "CLIENT", status: "INVITED", password: false });
      const res = await as(admin).post("/api/v1/cases").send({ clientId: pending.id, serviceId: "llc", deadline: "2027-05-01" });
      expect(res.status).toBe(201);
      expect(res.body.data.stage).toBe("INVITATION_SENT");
    });

    it("refuses a second case for a client who already has one, naming their case ID", async () => {
      const res = await as(admin).post("/api/v1/cases").send({ clientId: client1.id, serviceId: "llc", deadline: "2027-05-01" });
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe("CASE_ALREADY_EXISTS");
      const caseNumber = (await t.prisma.clientProfile.findUniqueOrThrow({ where: { userId: client1.id } })).caseNumber;
      expect(res.body.message).toContain(caseNumber);
      expect((await t.prisma.counter.findUniqueOrThrow({ where: { key: "case" } })).value).toBe(100);
    });

    it("refuses a switched-off or unknown service, a missing date, and a removed or unknown client", async () => {
      const inactive = await as(admin).post("/api/v1/cases").send({ clientId: orphan.id, serviceId: "address", deadline: "2027-05-01" });
      expect(inactive.body.errorCode).toBe("SERVICE_INACTIVE");
      const unknown = await as(admin).post("/api/v1/cases").send({ clientId: orphan.id, serviceId: "nope", deadline: "2027-05-01" });
      expect(unknown.body.errors[0].field).toBe("serviceId");
      const noDate = await as(admin).post("/api/v1/cases").send({ clientId: orphan.id, serviceId: "llc" });
      expect(noDate.status).toBe(422);
      expect(noDate.body.errors).toEqual([{ field: "deadline", message: "Choose a target date (YYYY-MM-DD)." }]);
      const badDate = await as(admin).post("/api/v1/cases").send({ clientId: orphan.id, serviceId: "llc", deadline: "31/12/2027" });
      expect(badDate.status).toBe(422);

      const ghost = await as(admin).post("/api/v1/cases").send({ clientId: "nobody", serviceId: "llc", deadline: "2027-05-01" });
      expect(ghost.status).toBe(404);
      const notAClient = await as(admin).post("/api/v1/cases").send({ clientId: csr1.id, serviceId: "llc", deadline: "2027-05-01" });
      expect(notAClient.status).toBe(404);

      await as(admin).delete(`/api/v1/users/${orphan.id}`);
      const removed = await as(admin).post("/api/v1/cases").send({ clientId: orphan.id, serviceId: "llc", deadline: "2027-05-01" });
      expect(removed.status).toBe(409);
      expect(removed.body.errorCode).toBe("USER_REMOVED");
    });

    it("is limited to Admin and Manager", async () => {
      for (const who of [csr2, compliance, client1]) {
        const res = await as(who).post("/api/v1/cases").send({ clientId: orphan.id, serviceId: "llc", deadline: "2027-05-01" });
        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Only Admin and Manager can create cases or edit case details and team assignments.");
      }
    });
  });

  describe("edit", () => {
    it("changes priority, target date, owner, service and status, and records what changed", async () => {
      const res = await as(manager).patch(`/api/v1/cases/${case1.id}`).send({ version: 1, priority: "URGENT", deadline: "2027-06-15", serviceId: "corp", status: "ON_HOLD" });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ priority: "URGENT", deadline: "2027-06-15", service: { id: "corp" }, status: "ON_HOLD", version: 2 });
      const event = await t.prisma.caseEvent.findFirstOrThrow({ where: { caseId: case1.id } });
      expect(event.toStage).toBeNull();
      expect(event.note).toBe("Updated priority → Urgent, target date → 2027-06-15, status Awaiting Client → On Hold, service → Corporation formation");
      expect(await t.prisma.auditLog.count({ where: { action: { startsWith: `Updated case PRJ-${case1.number}` }, actorId: manager.id } })).toBe(1);
    });

    it("sets and clears the compliance owner, and tells the new owner", async () => {
      const other = await makeUser(t.prisma, { email: "comp2@test.dev", name: "Omar Compliance", role: "COMPLIANCE" });
      const set = await as(admin).patch(`/api/v1/cases/${case2.id}`).send({ version: 1, ownerId: other.id });
      expect(set.status).toBe(200);
      expect(set.body.data.owner).toEqual({ id: other.id, name: "Omar Compliance" });
      expect(await t.prisma.notification.count({ where: { userId: other.id, text: `You now own compliance for PRJ-${case2.number}` } })).toBe(1);

      const cleared = await as(admin).patch(`/api/v1/cases/${case2.id}`).send({ version: 2, ownerId: null, deadline: null });
      expect(cleared.status).toBe(200);
      expect(cleared.body.data).toMatchObject({ owner: null, deadline: null, version: 3 });
    });

    it("accepts only an active Compliance user as owner", async () => {
      const suspended = await makeUser(t.prisma, { email: "sus@test.dev", name: "Sam", role: "COMPLIANCE", status: "SUSPENDED" });
      for (const ownerId of [csr1.id, suspended.id, "nobody"]) {
        const res = await as(admin).patch(`/api/v1/cases/${case2.id}`).send({ version: 1, ownerId });
        expect(res.status).toBe(422);
        expect(res.body).toMatchObject({ errorCode: "INVALID_CASE_OWNER", errors: [{ field: "ownerId", message: "Choose an active Compliance user." }] });
      }
      expect((await fresh(case2.id)).ownerId).toBeNull();
    });

    it("refuses a switched-off service, Completed as a status, and an empty change", async () => {
      expect((await as(admin).patch(`/api/v1/cases/${case1.id}`).send({ version: 1, serviceId: "address" })).body.errorCode).toBe("SERVICE_INACTIVE");
      const completed = await as(admin).patch(`/api/v1/cases/${case1.id}`).send({ version: 1, status: "COMPLETED" });
      expect(completed.status).toBe(422);
      expect(completed.body.errors[0]).toMatchObject({ field: "status" });
      expect(completed.body.errors[0].message).toContain("moving it to the Completed stage");
      const empty = await as(admin).patch(`/api/v1/cases/${case1.id}`).send({ version: 1 });
      expect(empty.status).toBe(422);
      expect(empty.body.errors).toEqual([{ field: "body", message: "Send at least one field to change." }]);
      const noVersion = await as(admin).patch(`/api/v1/cases/${case1.id}`).send({ priority: "LOW" });
      expect(noVersion.status).toBe(422);
      expect(noVersion.body.errors[0].field).toBe("version");
    });

    it("leaves the version alone when nothing actually changes", async () => {
      const res = await as(admin).patch(`/api/v1/cases/${case1.id}`).send({ version: 1, priority: "NORMAL" });
      expect(res.status).toBe(200);
      expect(res.body.data.version).toBe(1);
      expect(await t.prisma.caseEvent.count({ where: { caseId: case1.id } })).toBe(0);
    });

    it("is limited to Admin and Manager", async () => {
      for (const who of [csr1, compliance, client1]) {
        const res = await as(who).patch(`/api/v1/cases/${case1.id}`).send({ version: 1, priority: "LOW" });
        expect(res.status).toBe(403);
      }
    });

    it("refuses edits to a case that was removed with its client, with a specific message", async () => {
      await as(admin).delete(`/api/v1/users/${client1.id}`);
      const row = await fresh(case1.id);
      expect(row.deletedAt).not.toBeNull();

      const patch = await as(admin).patch(`/api/v1/cases/${case1.id}`).send({ version: row.version, priority: "LOW" });
      expect(patch.status).toBe(409);
      expect(patch.body.errorCode).toBe("CASE_DELETED");
      expect(patch.body.message).toBe(`PRJ-${case1.number} was removed (its client was removed from the portal), so it is read-only.`);
      expect((await stage(admin, case1.id, { targetStage: "CLIENT_ONBOARDING", version: row.version })).body.errorCode).toBe("CASE_DELETED");
      expect((await as(admin).post(`/api/v1/cases/${case1.id}/notes`).send({ text: "late note" })).body.errorCode).toBe("CASE_DELETED");

      // Admin and Manager can still read it; nobody else can even see it.
      expect((await as(manager).get(`/api/v1/cases/${case1.id}`)).body.data.deletedAt).not.toBeNull();
      for (const who of [compliance, csr1]) expect((await as(who).get(`/api/v1/cases/${case1.id}`)).status).toBe(404);
      expect((await as(admin).get("/api/v1/cases")).body.data.map((c: { id: string }) => c.id)).toEqual([case2.id]);
    });
  });

  describe("notes: who can read and write which", () => {
    let staffNote: string;
    let complianceNote: string;
    beforeEach(async () => {
      const a = await as(csr1).post(`/api/v1/cases/${case1.id}/notes`).send({ text: "Client prefers mornings", visibility: "STAFF" });
      const b = await as(compliance).post(`/api/v1/cases/${case1.id}/notes`).send({ text: "Possible name clash, check the registry", visibility: "COMPLIANCE" });
      expect([a.status, b.status]).toEqual([201, 201]);
      staffNote = a.body.data.id;
      complianceNote = b.body.data.id;
    });

    const notesOf = async (who: User, id = case1.id): Promise<string[]> => (await as(who).get(`/api/v1/cases/${id}`)).body.data.notes.map((n: { id: string }) => n.id);

    it("hides a COMPLIANCE-visibility note from the CSR", async () => {
      expect(await notesOf(csr1)).toEqual([staffNote]);
    });

    it("hides a COMPLIANCE-visibility note from the client", async () => {
      expect(await notesOf(client1)).not.toContain(complianceNote);
    });

    it("hides a STAFF note from the client", async () => {
      expect(await notesOf(client1)).toEqual([]);
      const body = JSON.stringify((await as(client1).get(`/api/v1/cases/${case1.id}`)).body);
      expect(body).not.toContain("Client prefers mornings");
      expect(body).not.toContain("registry");
    });

    it("shows both kinds to Admin, Manager and Compliance, oldest first", async () => {
      for (const who of [admin, manager, compliance]) expect(await notesOf(who)).toEqual([staffNote, complianceNote]);
    });

    it("keeps a COMPLIANCE note out of every other route too", async () => {
      // Not in the timeline, the list or the events.
      const events = JSON.stringify((await as(csr1).get(`/api/v1/cases/${case1.id}/events`)).body);
      expect(events).not.toContain("registry");
      const list = JSON.stringify((await as(csr1).get("/api/v1/cases")).body);
      expect(list).not.toContain("registry");
      expect(list).not.toContain("mornings");
    });

    it("refuses a COMPLIANCE-visibility note from a CSR, with the rule's message", async () => {
      const res = await as(csr1).post(`/api/v1/cases/${case1.id}/notes`).send({ text: "Try to hide this", visibility: "COMPLIANCE" });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Compliance-only notes are visible to Compliance, Manager and Admin.");
      expect(await t.prisma.caseNote.count({ where: { text: "Try to hide this" } })).toBe(0);
    });

    it("refuses any note from a client", async () => {
      const res = await as(client1).post(`/api/v1/cases/${case1.id}/notes`).send({ text: "Hello team" });
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe("PERMISSION_DENIED");
    });

    it("gives a CSR 404 for another CSR's case, reading or writing", async () => {
      expect((await as(csr1).get(`/api/v1/cases/${case2.id}`)).status).toBe(404);
      const write = await as(csr1).post(`/api/v1/cases/${case2.id}/notes`).send({ text: "Snooping" });
      expect(write.status).toBe(404);
      expect(await t.prisma.caseNote.count({ where: { caseId: case2.id } })).toBe(0);
    });

    it("records the note, who wrote it, and moves 'last activity' without touching the version", async () => {
      const before = await fresh(case1.id);
      const res = await as(manager).post(`/api/v1/cases/${case1.id}/notes`).send({ text: "  Spoke to the client  " });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ caseId: case1.id, visibility: "STAFF", text: "Spoke to the client", author: { id: manager.id, name: "Max Manager" } });
      const after = await fresh(case1.id);
      expect(after.version).toBe(before.version);
      expect(after.lastActivityAt.getTime()).toBeGreaterThan(before.lastActivityAt.getTime());
      expect(await t.prisma.auditLog.count({ where: { action: `Added internal note on PRJ-${case1.number}`, actorId: manager.id } })).toBe(1);
      // A note never notifies the client.
      expect(await t.prisma.notification.count({ where: { userId: client1.id } })).toBe(0);
    });

    it("validates the note", async () => {
      const blank = await as(csr1).post(`/api/v1/cases/${case1.id}/notes`).send({ text: "   " });
      expect(blank.status).toBe(422);
      expect(blank.body.errors).toEqual([{ field: "text", message: "Write a note first." }]);
      const long = await as(csr1).post(`/api/v1/cases/${case1.id}/notes`).send({ text: "n".repeat(5001) });
      expect(long.body.errors[0].message).toBe("A note can't be longer than 5000 characters.");
      const vis = await as(csr1).post(`/api/v1/cases/${case1.id}/notes`).send({ text: "x", visibility: "PUBLIC" });
      expect(vis.body.errors[0].field).toBe("visibility");
    });
  });

  describe("scope", () => {
    it("shows a CSR only the cases of their own clients", async () => {
      const list = await as(csr1).get("/api/v1/cases");
      expect(list.body.data.map((c: { id: string }) => c.id)).toEqual([case1.id]);
      expect(list.body.meta.total).toBe(1);
      const other = await as(csr1).get(`/api/v1/cases/${case2.id}`);
      expect(other.status).toBe(404);
      expect(other.body.errorCode).toBe("RESOURCE_NOT_FOUND");
      expect((await as(csr1).get(`/api/v1/cases/${case2.id}/events`)).status).toBe(404);
      // A filter can't widen the scope.
      expect((await as(csr1).get(`/api/v1/cases?clientId=${client2.id}`)).body.data).toEqual([]);
    });

    it("gives a client 404 for another client's case, and shows them their own", async () => {
      const other = await as(client1).get(`/api/v1/cases/${case2.id}`);
      expect(other.status).toBe(404);
      expect(other.body.errorCode).toBe("RESOURCE_NOT_FOUND");
      expect((await as(client1).get(`/api/v1/cases/${case2.id}/events`)).status).toBe(404);
      expect((await as(client1).get("/api/v1/cases")).body.data.map((c: { id: string }) => c.id)).toEqual([case1.id]);
      const own = await as(client1).get(`/api/v1/cases/${case1.id}`);
      expect(own.status).toBe(200);
      expect(own.body.data.id).toBe(case1.id);
    });

    it("gives a 404 for a case that doesn't exist that is the same shape as one outside the scope", async () => {
      const outside = await as(csr1).get(`/api/v1/cases/${case2.id}`);
      const missing = await as(csr1).get("/api/v1/cases/does-not-exist");
      expect(missing.status).toBe(outside.status);
      expect(missing.body.errorCode).toBe(outside.body.errorCode);
      expect(missing.body.message.replace("does-not-exist", "X")).toBe(outside.body.message.replace(case2.id, "X"));
    });

    it("lets Admin, Manager and Compliance see every case", async () => {
      for (const who of [admin, manager, compliance]) {
        expect((await as(who).get("/api/v1/cases")).body.meta.total).toBe(2);
        expect((await as(who).get(`/api/v1/cases/${case2.id}`)).status).toBe(200);
      }
    });

    it("follows a reassignment at once", async () => {
      await as(admin).patch(`/api/v1/clients/${client1.id}/csr`).send({ csrId: csr2.id });
      expect((await as(csr1).get(`/api/v1/cases/${case1.id}`)).status).toBe(404);
      expect((await as(csr2).get("/api/v1/cases")).body.meta.total).toBe(2);
    });

    it("requires a signed-in user", async () => {
      expect((await api(t).get("/api/v1/cases")).status).toBe(401);
    });
  });

  describe("detail", () => {
    it("shows staff the whole timeline with who and why, filings and a task summary", async () => {
      await stage(admin, case1.id, { targetStage: "CLIENT_ONBOARDING", version: 1, note: "Kick-off" });
      await t.prisma.filing.create({ data: { number: 1, caseId: case1.id, type: "Certificate of Organization", status: "SUBMITTED", submittedOn: new Date("2026-10-01") } });
      const today = new Date();
      const yesterday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));
      const later = new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 1));
      const mk = (title: string, extra: Record<string, unknown>) => ({ caseId: case1.id, title, type: "OPERATIONS" as const, due: later, createdById: admin.id, assigneeId: manager.id, ...extra });
      await t.prisma.task.createMany({
        data: [mk("Overdue", { due: yesterday }), mk("Open", {}), mk("Done", { done: true }), mk("For the client", { visibility: "CLIENT" })],
      });

      const res = await as(compliance).get(`/api/v1/cases/${case1.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: case1.id,
        displayNumber: `PRJ-${case1.number}`,
        stage: "CLIENT_ONBOARDING",
        client: { name: "Alex Client", businessName: "Northfield Studio LLC" },
        owner: { id: compliance.id },
        tasks: { total: 4, open: 3, overdue: 1 },
      });
      expect(res.body.data.events).toMatchObject([{ toStage: "CLIENT_ONBOARDING", note: "Kick-off", by: { id: admin.id, name: "Ada Admin" } }]);
      expect(res.body.data.filings).toMatchObject([{ displayNumber: "FIL-1", type: "Certificate of Organization", status: "SUBMITTED", submittedOn: "2026-10-01" }]);
    });

    it("shows a client the stage changes only, only their own tasks, and no filings", async () => {
      await stage(admin, case1.id, { targetStage: "CLIENT_ONBOARDING", version: 1, note: "Internal: client is slow to reply" });
      await t.prisma.task.createMany({
        data: [
          { caseId: case1.id, title: "Internal", type: "OPERATIONS", due: new Date("2027-01-01"), createdById: admin.id, assigneeId: manager.id },
          { caseId: case1.id, title: "Upload passport", type: "OPERATIONS", visibility: "CLIENT", due: new Date("2027-01-01"), createdById: admin.id, assigneeId: manager.id },
        ],
      });
      const res = await as(client1).get(`/api/v1/cases/${case1.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.events).toEqual([{ id: expect.any(String), toStage: "CLIENT_ONBOARDING", at: expect.any(String) }]);
      expect(res.body.data.tasks).toEqual({ total: 1, open: 1, overdue: 0 });
      expect(res.body.data.filings).toBeNull();
      expect(res.body.data.notes).toEqual([]);
      expect(JSON.stringify(res.body)).not.toContain("slow to reply");
    });

    it("hides filings from a CSR but not from Admin", async () => {
      await t.prisma.filing.create({ data: { number: 1, caseId: case1.id, type: "Annual report", status: "NOT_SUBMITTED" } });
      expect((await as(csr1).get(`/api/v1/cases/${case1.id}`)).body.data.filings).toBeNull();
      expect((await as(admin).get(`/api/v1/cases/${case1.id}`)).body.data.filings).toHaveLength(1);
    });

    it("pages through the timeline, newest first on request, and a client sees stage changes only", async () => {
      await stage(admin, case1.id, { targetStage: "CLIENT_ONBOARDING", version: 1, note: "one" });
      await as(admin).patch(`/api/v1/cases/${case1.id}`).send({ version: 2, priority: "HIGH" });
      await stage(admin, case1.id, { targetStage: "INFORMATION_REQUIRED", version: 3, note: "three" });

      const all = await as(admin).get(`/api/v1/cases/${case1.id}/events`);
      expect(all.body.meta).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });
      expect(all.body.data.map((e: { toStage: string | null }) => e.toStage)).toEqual(["CLIENT_ONBOARDING", null, "INFORMATION_REQUIRED"]);
      const desc = await as(admin).get(`/api/v1/cases/${case1.id}/events?order=desc&limit=2`);
      expect(desc.body.data.map((e: { toStage: string | null }) => e.toStage)).toEqual(["INFORMATION_REQUIRED", null]);
      expect(desc.body.meta).toMatchObject({ limit: 2, total: 3, totalPages: 2 });

      const forClient = await as(client1).get(`/api/v1/cases/${case1.id}/events`);
      expect(forClient.body.data.map((e: { toStage: string }) => e.toStage)).toEqual(["CLIENT_ONBOARDING", "INFORMATION_REQUIRED"]);
      expect(forClient.body.data[0].note).toBeUndefined();
      expect(forClient.body.data[0].by).toBeUndefined();
      expect((await as(admin).get(`/api/v1/cases/${case1.id}/events?limit=101`)).body.errors[0].field).toBe("limit");
    });
  });

  describe("list", () => {
    beforeEach(async () => {
      await t.prisma.case.update({ where: { id: case1.id }, data: { stage: "DOCUMENTS_PENDING", status: "ACTIVE", priority: "HIGH", deadline: new Date("2026-11-10T00:00:00Z"), serviceId: "llc" } });
      await t.prisma.case.update({ where: { id: case2.id }, data: { stage: "READY_FOR_FILING", status: "BLOCKED", priority: "LOW", deadline: new Date("2026-12-20T00:00:00Z"), serviceId: "corp", ownerId: null } });
    });
    const ids = async (query: string, who: User = admin): Promise<string[]> => (await as(who).get(`/api/v1/cases${query}`)).body.data.map((c: { id: string }) => c.id);

    it("filters by stage, status, priority, owner, client and service", async () => {
      expect(await ids("?stage=READY_FOR_FILING")).toEqual([case2.id]);
      expect(await ids("?status=ACTIVE")).toEqual([case1.id]);
      expect(await ids("?priority=LOW")).toEqual([case2.id]);
      expect(await ids(`?ownerId=${compliance.id}`)).toEqual([case1.id]);
      expect(await ids("?ownerId=none")).toEqual([case2.id]);
      expect(await ids(`?clientId=${client2.id}`)).toEqual([case2.id]);
      expect(await ids("?serviceId=corp")).toEqual([case2.id]);
      expect(await ids("?stage=COMPLETED")).toEqual([]);
    });

    it("filters by a deadline range, inclusive on both ends", async () => {
      expect(await ids("?deadlineFrom=2026-11-10&deadlineTo=2026-12-19")).toEqual([case1.id]);
      expect(await ids("?deadlineFrom=2026-12-20")).toEqual([case2.id]);
      expect(await ids("?deadlineTo=2026-12-20&sort=deadline")).toEqual([case1.id, case2.id]);
      const backwards = await as(admin).get("/api/v1/cases?deadlineFrom=2026-12-01&deadlineTo=2026-11-01");
      expect(backwards.status).toBe(422);
      expect(backwards.body.errors).toEqual([{ field: "deadlineTo", message: "deadlineTo can't be before deadlineFrom." }]);
      expect((await as(admin).get("/api/v1/cases?deadlineFrom=soon")).body.errors[0].field).toBe("deadlineFrom");
    });

    it("searches client, business, case ID, service and case number", async () => {
      const caseId = (await t.prisma.clientProfile.findUniqueOrThrow({ where: { userId: client2.id } })).caseNumber;
      expect(await ids("?search=northfield")).toEqual([case1.id]);
      expect(await ids("?search=BEA")).toEqual([case2.id]);
      expect(await ids("?search=client1%40")).toEqual([case1.id]);
      expect(await ids(`?search=${caseId}`)).toEqual([case2.id]);
      expect(await ids("?search=corporation")).toEqual([case2.id]);
      expect(await ids(`?search=PRJ-${case1.number}`)).toEqual([case1.id]);
      expect(await ids(`?search=${case2.number}`)).toEqual([case2.id]);
      expect(await ids("?search=zzzz")).toEqual([]);
    });

    it("sorts by the fields it offers, in either direction, and rejects others", async () => {
      expect(await ids("?sort=priority&order=asc")).toEqual([case2.id, case1.id]);
      expect(await ids("?sort=priority&order=desc")).toEqual([case1.id, case2.id]);
      expect(await ids("?sort=stage&order=desc")).toEqual([case2.id, case1.id]);
      expect(await ids("?sort=number&order=asc")).toEqual([case1.id, case2.id]);
      const bad = await as(admin).get("/api/v1/cases?sort=ownerId");
      expect(bad.status).toBe(422);
      expect(bad.body.errors).toEqual([{ field: "sort", message: "You can sort by number, stage, status, priority, deadline, lastActivityAt, createdAt." }]);
    });

    it("sorts the newest activity first by default, and puts cases without a date last", async () => {
      await t.prisma.case.update({ where: { id: case1.id }, data: { lastActivityAt: new Date(Date.now() + 60_000) } });
      expect(await ids("")).toEqual([case1.id, case2.id]);
      await t.prisma.case.update({ where: { id: case1.id }, data: { deadline: null } });
      expect(await ids("?sort=deadline&order=asc")).toEqual([case2.id, case1.id]);
      expect(await ids("?sort=deadline&order=desc")).toEqual([case2.id, case1.id]);
    });

    it("paginates, and rejects a page below 1 and a limit above 100 with a message on the field", async () => {
      const first = await as(admin).get("/api/v1/cases?limit=1&page=1&sort=number");
      expect(first.body.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
      expect(first.body.data).toHaveLength(1);
      expect((await as(admin).get("/api/v1/cases?limit=1&page=3")).body.data).toEqual([]);

      const bad = await as(admin).get("/api/v1/cases?page=0&limit=101");
      expect(bad.status).toBe(422);
      expect(bad.body.errorCode).toBe("VALIDATION_FAILED");
      expect(bad.body.errors).toEqual(
        expect.arrayContaining([
          { field: "page", message: "page must be 1 or greater." },
          { field: "limit", message: "limit can't be more than 100. Ask for a smaller page." },
        ]),
      );
      expect((await as(admin).get("/api/v1/cases?stage=NOPE")).body.errors[0].field).toBe("stage");
    });

    it("returns each case with its client, service, owner and version", async () => {
      const res = await as(admin).get("/api/v1/cases?sort=number&order=asc");
      expect(res.body.data[0]).toMatchObject({
        id: case1.id,
        displayNumber: `PRJ-${case1.number}`,
        version: 1,
        stage: "DOCUMENTS_PENDING",
        deadline: "2026-11-10",
        service: { id: "llc", name: "LLC formation" },
        client: { name: "Alex Client", businessName: "Northfield Studio LLC", formationState: "Wyoming" },
        owner: { id: compliance.id, name: "Cleo Compliance" },
      });
    });
  });
});
