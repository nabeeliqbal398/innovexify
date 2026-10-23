import { FilingsRepository } from "../src/modules/filings/repository/filings.repository";
import { api, bearerFor, createAppWithMail, dayOffset, makeCase, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

type User = Awaited<ReturnType<typeof makeUser>>;
type CaseRow = Awaited<ReturnType<typeof makeCase>>;

describe("filings and reminders (e2e)", () => {
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
  let compliance: User;
  let client1: User;
  let client2: User;
  let case1: CaseRow;
  let case2: CaseRow;

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    admin = await makeUser(t.prisma, { email: "admin@test.dev", name: "Ada Admin", role: "ADMIN" });
    manager = await makeUser(t.prisma, { email: "manager@test.dev", name: "Max Manager", role: "MANAGER" });
    csr1 = await makeUser(t.prisma, { email: "csr1@test.dev", name: "Cora CSR", role: "CSR" });
    compliance = await makeUser(t.prisma, { email: "comp@test.dev", name: "Cleo Compliance", role: "COMPLIANCE" });
    client1 = await makeUser(t.prisma, { email: "client1@test.dev", name: "Alex Client", role: "CLIENT", csrId: csr1.id });
    client2 = await makeUser(t.prisma, { email: "client2@test.dev", name: "Bea Client", role: "CLIENT", csrId: csr1.id });
    case1 = await makeCase(t.prisma, { clientId: client1.id, stage: "STATE_FILING_IN_PROGRESS", status: "ACTIVE" });
    case2 = await makeCase(t.prisma, { clientId: client2.id });
  });

  const as = (user: { id: string; role: Parameters<typeof bearerFor>[1]["role"] }) => api(t, bearerFor(t, user));
  const create = (who: User, body: Record<string, unknown> = {}) => as(who).post("/api/v1/filings").send({ caseId: case1.id, type: "Articles of Organization", ...body });
  const counter = async (): Promise<number> => (await t.prisma.counter.findUniqueOrThrow({ where: { key: "filing" } })).value;
  const ids = async (who: User, query = ""): Promise<string[]> => (await as(who).get(`/api/v1/filings${query}`)).body.data.map((f: { id: string }) => f.id);

  describe("access", () => {
    it("is for Admin, Manager and Compliance only, on every route", async () => {
      const filing = (await create(admin)).body.data.id as string;
      for (const who of [csr1, client1]) {
        for (const res of [
          await as(who).get("/api/v1/filings"),
          await as(who).get(`/api/v1/cases/${case1.id}/filings`),
          await as(who).get(`/api/v1/cases/${case1.id}/reminders`),
          await create(who),
          await as(who).patch(`/api/v1/filings/${filing}`).send({ nextAction: "x" }),
          await as(who).post(`/api/v1/cases/${case1.id}/reminders`).send({ title: "x", date: "2030-01-01", kind: "annual" }),
        ]) {
          expect(res.status).toBe(403);
          expect(res.body.message).toBe("The filing tracker is limited to Compliance, Manager and Admin.");
        }
      }
      for (const who of [admin, manager, compliance]) expect((await as(who).get("/api/v1/filings")).status).toBe(200);
      expect((await api(t).get("/api/v1/filings")).status).toBe(401);
    });
  });

  describe("create", () => {
    it("takes the next number from the filing counter and records it", async () => {
      const res = await create(compliance, { nextAction: "Check the state portal", nextActionDate: "2030-02-01" });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        number: 1,
        displayNumber: "FIL-1",
        type: "Articles of Organization",
        status: "NOT_SUBMITTED",
        submittedOn: null,
        reference: "",
        nextAction: "Check the state portal",
        nextActionDate: "2030-02-01",
        outcome: "",
        late: false,
        case: { id: case1.id, displayNumber: `PRJ-${case1.number}`, client: { id: client1.id, name: "Alex Client" } },
      });
      expect(res.body.message).toBe("FIL-1 recorded (manual record, no state system was contacted).");
      expect(await counter()).toBe(1);
      const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { action: "Added filing FIL-1 · Articles of Organization · Not submitted" } });
      expect(audit).toMatchObject({ actorId: compliance.id, category: "cases" });
      expect(audit.target).toMatch(/^CASE-T-/);
    });

    it("hands out unique, gap-free filing numbers to 20 filings created at the same time", async () => {
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => create(i % 2 ? manager : admin, { type: `Annual report ${i}` })));
      expect(results.map((r) => r.status)).toEqual(Array(20).fill(201));
      const numbers = results.map((r) => r.body.data.number as number).sort((a, b) => a - b);
      expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
      expect(new Set(results.map((r) => r.body.data.displayNumber)).size).toBe(20);
      expect(await counter()).toBe(20);
    });

    it("gives the number back when the write fails, so no number is wasted", async () => {
      const spy = jest.spyOn(t.app.get(FilingsRepository), "create").mockRejectedValueOnce(new Error("database went away"));
      try {
        expect((await create(admin)).status).toBe(500);
      } finally {
        spy.mockRestore();
      }
      expect(await counter()).toBe(0);
      expect(await t.prisma.filing.count()).toBe(0);
      expect((await create(admin)).body.data.number).toBe(1);
    });
  });

  describe("the tracker's rules (ported from saveFiling)", () => {
    it.each(["SUBMITTED", "PENDING_STATE_REVIEW", "APPROVED", "REJECTED"])("needs a submission date once the status is %s", async (status) => {
      const res = await create(admin, { status, reference: "WY-1" });
      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe("FILING_SUBMISSION_DATE_REQUIRED");
      expect(res.body.errors).toEqual([{ field: "submittedOn", message: "Enter the submission date." }]);
      expect(await t.prisma.filing.count()).toBe(0);
      expect(await counter()).toBe(0);
    });

    it("needs no date while it is Not submitted", async () => {
      expect((await create(admin, { status: "NOT_SUBMITTED" })).status).toBe(201);
    });

    it("needs the state's reference number to be Approved, with the same code the stage move uses", async () => {
      for (const reference of [undefined, "", "   "]) {
        const res = await create(admin, { status: "APPROVED", submittedOn: dayOffset(-3), ...(reference === undefined ? {} : { reference }) });
        expect(res.status).toBe(422);
        expect(res.body).toMatchObject({
          errorCode: "FILING_NUMBER_REQUIRED",
          message: "Approved filings need the reference number issued by the state. Enter it and try again.",
          errors: [{ field: "reference", message: "Enter the reference number issued by the state." }],
        });
      }
      const ok = await create(admin, { status: "APPROVED", submittedOn: dayOffset(-3), reference: "WY-2026-5521" });
      expect(ok.status).toBe(201);
      expect(ok.body.data).toMatchObject({ status: "APPROVED", reference: "WY-2026-5521", outcome: "Approved" });
    });

    it("does not need a reference for Rejected", async () => {
      const res = await create(admin, { status: "REJECTED", submittedOn: dayOffset(-3) });
      expect(res.status).toBe(201);
      expect(res.body.data.outcome).toBe("Rejected");
    });

    it("refuses a submission date in the future, and accepts today", async () => {
      const future = await create(admin, { status: "SUBMITTED", submittedOn: dayOffset(1) });
      expect(future.status).toBe(422);
      expect(future.body).toMatchObject({
        errorCode: "FILING_DATE_IN_FUTURE",
        message: "The submission date can't be in the future. Enter the day the filing was actually submitted.",
        errors: [{ field: "submittedOn", message: "Enter a date that isn't in the future." }],
      });
      expect((await create(admin, { status: "SUBMITTED", submittedOn: dayOffset(0) })).status).toBe(201);
      // Even a date given with a status that doesn't need one is checked.
      expect((await create(admin, { status: "NOT_SUBMITTED", submittedOn: dayOffset(30) })).body.errorCode).toBe("FILING_DATE_IN_FUTURE");
    });

    it("checks the rules in the prototype's order: date first, then the reference", async () => {
      const res = await create(admin, { status: "APPROVED" });
      expect(res.body.errorCode).toBe("FILING_SUBMISSION_DATE_REQUIRED");
    });

    it("validates the other fields", async () => {
      const res = await as(admin).post("/api/v1/filings").send({ type: "t".repeat(121), status: "DONE", reference: "r".repeat(65), nextAction: "n".repeat(201), nextActionDate: "soon", submittedOn: "2030-02-30", extra: 1 });
      expect(res.status).toBe(422);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          { field: "caseId", message: "Choose the case this filing belongs to." },
          { field: "type", message: "The filing type can't be longer than 120 characters." },
          { field: "status", message: expect.stringContaining("status must be one of") },
          { field: "reference", message: "The reference can't be longer than 64 characters." },
          { field: "nextAction", message: "The next action can't be longer than 200 characters." },
          { field: "nextActionDate", message: "Enter the next action date as YYYY-MM-DD." },
          { field: "submittedOn", message: "Enter the submission date as YYYY-MM-DD." },
          { field: "extra", message: "property extra should not exist" },
        ]),
      );
      expect((await create(admin, { type: "   " })).body.errors[0]).toEqual({ field: "type", message: "Enter the filing type." });
      expect((await create(admin, { caseId: "nope" })).status).toBe(404);
    });
  });

  describe("status only moves forward", () => {
    let filingId: string;
    beforeEach(async () => {
      filingId = (await create(admin)).body.data.id as string;
    });
    const patch = (who: User, body: Record<string, unknown>) => as(who).patch(`/api/v1/filings/${filingId}`).send(body);

    it("lets a filing move forward, and skip ahead, with the rules applied to each step", async () => {
      const submitted = await patch(compliance, { status: "SUBMITTED", submittedOn: dayOffset(-5) });
      expect(submitted.status).toBe(200);
      expect(submitted.body.data).toMatchObject({ status: "SUBMITTED", submittedOn: dayOffset(-5) });
      expect((await patch(compliance, { status: "PENDING_STATE_REVIEW" })).body.data.status).toBe("PENDING_STATE_REVIEW");
      const approved = await patch(compliance, { status: "APPROVED", reference: "WY-9" });
      expect(approved.body.data).toMatchObject({ status: "APPROVED", reference: "WY-9", outcome: "Approved" });

      const second = (await create(admin, { type: "EIN application (SS-4)" })).body.data.id as string;
      const skip = await as(admin).patch(`/api/v1/filings/${second}`).send({ status: "APPROVED", submittedOn: dayOffset(-1), reference: "EIN-1" });
      expect(skip.status).toBe(200);
    });

    it("applies the date and reference rules on an update too, using what is already on file", async () => {
      const noDate = await patch(compliance, { status: "SUBMITTED" });
      expect(noDate.body.errorCode).toBe("FILING_SUBMISSION_DATE_REQUIRED");
      await patch(compliance, { status: "SUBMITTED", submittedOn: dayOffset(-2) });
      expect((await patch(compliance, { status: "APPROVED" })).body.errorCode).toBe("FILING_NUMBER_REQUIRED");
      expect((await patch(compliance, { status: "APPROVED", reference: "R-1" })).status).toBe(200);
      // A saved reference can't be blanked out of an approved filing.
      expect((await patch(compliance, { reference: "" })).body.errorCode).toBe("FILING_NUMBER_REQUIRED");
      expect((await patch(compliance, { submittedOn: dayOffset(2) })).body.errorCode).toBe("FILING_DATE_IN_FUTURE");
      expect((await patch(compliance, { submittedOn: null })).body.errorCode).toBe("FILING_SUBMISSION_DATE_REQUIRED");
    });

    it("refuses a backward move from Compliance, naming both statuses", async () => {
      await patch(compliance, { status: "PENDING_STATE_REVIEW", submittedOn: dayOffset(-4) });
      const res = await patch(compliance, { status: "SUBMITTED", reason: "Entered by mistake" });
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe("INVALID_STATE_TRANSITION");
      expect(res.body.message).toBe('A filing can\'t move from "Pending state review" to "Submitted". A filing only moves forward. Ask an Admin or Manager to move it back, with a reason.');
      expect((await t.prisma.filing.findUniqueOrThrow({ where: { id: filingId } })).status).toBe("PENDING_STATE_REVIEW");
    });

    it("lets Admin and Manager move it back, but only with a reason, which goes in the audit log", async () => {
      await patch(admin, { status: "PENDING_STATE_REVIEW", submittedOn: dayOffset(-4) });
      for (const who of [admin, manager]) {
        const noReason = await patch(who, { status: "SUBMITTED" });
        expect(noReason.status).toBe(422);
        expect(noReason.body).toMatchObject({
          errorCode: "FILING_REASON_REQUIRED",
          message: 'Moving a filing back from "Pending state review" to "Submitted" needs a reason, so the team can see why. Add one and try again.',
          errors: [{ field: "reason", message: "Explain why the filing is moving back." }],
        });
      }
      const ok = await patch(manager, { status: "SUBMITTED", reason: "The state asked us to resubmit" });
      expect(ok.status).toBe(200);
      expect(ok.body.data.status).toBe("SUBMITTED");
      expect((await t.prisma.auditLog.findFirstOrThrow({ where: { action: { contains: "reason: The state asked us to resubmit" } } })).actorId).toBe(manager.id);
    });

    it("treats Approved and Rejected as two endings: moving between them is not 'forward'", async () => {
      await patch(admin, { status: "REJECTED", submittedOn: dayOffset(-4) });
      expect((await patch(compliance, { status: "APPROVED", reference: "R-2" })).body.errorCode).toBe("INVALID_STATE_TRANSITION");
      expect((await patch(admin, { status: "APPROVED", reference: "R-2" })).body.errorCode).toBe("FILING_REASON_REQUIRED");
      const ok = await patch(admin, { status: "APPROVED", reference: "R-2", reason: "The state corrected its decision" });
      expect(ok.status).toBe(200);
      expect(ok.body.data.outcome).toBe("Approved");
    });

    it("lets other fields change without moving the status, and writes nothing when nothing changed", async () => {
      const res = await patch(compliance, { nextAction: "Call the state office", nextActionDate: "2030-05-01", type: "Certificate of Formation", outcome: "Awaiting stamp" });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ nextAction: "Call the state office", nextActionDate: "2030-05-01", type: "Certificate of Formation", outcome: "Awaiting stamp", status: "NOT_SUBMITTED" });
      const before = await t.prisma.auditLog.count();
      expect((await patch(compliance, { nextAction: "Call the state office" })).status).toBe(200);
      expect(await t.prisma.auditLog.count()).toBe(before);
      expect((await patch(compliance, { nextActionDate: null })).body.data.nextActionDate).toBeNull();
      expect((await patch(compliance, {})).body.errors).toEqual([{ field: "body", message: "Send at least one field to change." }]);
    });

    it("lets only one of two conflicting status changes win when both started from the same status", async () => {
      await patch(admin, { status: "SUBMITTED", submittedOn: dayOffset(-4) });
      const auditedBefore = await t.prisma.auditLog.count({ where: { action: { startsWith: "Updated filing FIL-1" } } });
      // Hold both requests after they have read the filing, so each saw SUBMITTED.
      const repo = t.app.get(FilingsRepository);
      const original = repo.findOne.bind(repo);
      let arrived = 0;
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const spy = jest.spyOn(repo, "findOne").mockImplementation(async (...args) => {
        const found = await original(...args);
        if (++arrived === 2) release();
        await gate;
        return found;
      });
      try {
        const [a, b] = await Promise.all([patch(compliance, { status: "PENDING_STATE_REVIEW" }), patch(manager, { status: "REJECTED" })]);
        expect([a.status, b.status].sort()).toEqual([200, 409]);
        expect((a.status === 409 ? a : b).body.errorCode).toBe("CONCURRENT_MODIFICATION");
      } finally {
        spy.mockRestore();
      }
      expect(await t.prisma.auditLog.count({ where: { action: { startsWith: "Updated filing FIL-1" } } })).toBe(auditedBefore + 1);
    });

    it("returns 404 for a filing that doesn't exist or sits on a removed case", async () => {
      expect((await as(admin).patch("/api/v1/filings/nope").send({ nextAction: "x" })).status).toBe(404);
      await t.prisma.case.update({ where: { id: case1.id }, data: { deletedAt: new Date() } });
      expect((await patch(admin, { nextAction: "x" })).status).toBe(404);
    });
  });

  describe("effects on the case (the prototype's recording of a filing touches only the filing)", () => {
    it("leaves the case's stage, status, version, confirmation number and timeline alone", async () => {
      const before = await t.prisma.case.findUniqueOrThrow({ where: { id: case1.id } });
      const res = await create(admin, { status: "APPROVED", submittedOn: dayOffset(-2), reference: "WY-2026-7777" });
      expect(res.status).toBe(201);
      await as(admin).patch(`/api/v1/filings/${res.body.data.id}`).send({ nextAction: "Order the certified copy" });
      const after = await t.prisma.case.findUniqueOrThrow({ where: { id: case1.id } });
      expect(after).toMatchObject({ stage: before.stage, status: before.status, version: before.version, filingConfirmation: "", completedAt: null });
      expect(after.lastActivityAt.getTime()).toBe(before.lastActivityAt.getTime());
      expect(await t.prisma.caseEvent.count({ where: { caseId: case1.id } })).toBe(0);
      expect(await t.prisma.notification.count()).toBe(0);
    });

    it("does not stand in for the confirmation number a case needs to move past State Approval", async () => {
      await t.prisma.case.update({ where: { id: case1.id }, data: { stage: "STATE_APPROVAL_RECEIVED" } });
      await create(admin, { status: "APPROVED", submittedOn: dayOffset(-2), reference: "WY-2026-7777" });
      const move = await as(admin).post(`/api/v1/cases/${case1.id}/stage`).send({ targetStage: "EIN_PROCESSING", version: 1 });
      expect(move.status).toBe(422);
      expect(move.body.errorCode).toBe("FILING_NUMBER_REQUIRED");
    });

    it("still allows viewing and updating filings on a completed case, but not adding one", async () => {
      const existing = (await create(admin)).body.data.id as string;
      await t.prisma.case.update({ where: { id: case1.id }, data: { stage: "COMPLETED", status: "COMPLETED", completedAt: new Date() } });
      const add = await create(admin);
      expect(add.status).toBe(409);
      expect(add.body).toMatchObject({ errorCode: "CASE_COMPLETED", message: `PRJ-${case1.number} is completed, so no new filings can be added to it. You can still view its existing filings.` });
      expect((await as(compliance).get(`/api/v1/cases/${case1.id}/filings`)).body.data).toHaveLength(1);
      expect((await as(compliance).patch(`/api/v1/filings/${existing}`).send({ nextAction: "Archive" })).status).toBe(200);
      expect(await counter()).toBe(1);
    });

    it("refuses a new filing on a removed case", async () => {
      await t.prisma.case.update({ where: { id: case1.id }, data: { deletedAt: new Date() } });
      expect((await create(admin)).body.errorCode).toBe("CASE_DELETED");
    });
  });

  describe("list", () => {
    let a: string;
    let b: string;
    let c: string;
    beforeEach(async () => {
      a = (await create(admin, { type: "Articles of Organization", nextAction: "Chase", nextActionDate: dayOffset(-3) })).body.data.id;
      b = (await create(admin, { type: "EIN application (SS-4)", status: "APPROVED", submittedOn: dayOffset(-9), reference: "EIN-4421", nextActionDate: dayOffset(10) })).body.data.id;
      c = (await as(admin).post("/api/v1/filings").send({ caseId: case2.id, type: "Annual report", status: "SUBMITTED", submittedOn: dayOffset(-1), nextActionDate: dayOffset(40) })).body.data.id;
    });

    it("filters by status, next-action date range and case, scoped to the cases you can see", async () => {
      expect(await ids(compliance, "?status=APPROVED")).toEqual([b]);
      expect((await ids(compliance, `?nextActionFrom=${dayOffset(0)}&nextActionTo=${dayOffset(10)}`))).toEqual([b]);
      expect((await ids(compliance, `?nextActionFrom=${dayOffset(11)}`))).toEqual([c]);
      expect(await ids(compliance, `?nextActionTo=${dayOffset(-3)}`)).toEqual([a]);
      expect((await ids(compliance, `?caseId=${case2.id}`))).toEqual([c]);
      const backwards = await as(compliance).get(`/api/v1/filings?nextActionFrom=${dayOffset(5)}&nextActionTo=${dayOffset(1)}`);
      expect(backwards.status).toBe(422);
      expect(backwards.body.errors).toEqual([{ field: "nextActionTo", message: "nextActionTo can't be before nextActionFrom." }]);
      await t.prisma.case.update({ where: { id: case2.id }, data: { deletedAt: new Date() } });
      expect((await ids(compliance)).sort()).toEqual([a, b].sort());
    });

    it("searches type, reference, client and numbers, and marks late filings", async () => {
      expect(await ids(admin, "?search=EIN-4421")).toEqual([b]);
      expect(await ids(admin, "?search=annual")).toEqual([c]);
      expect(await ids(admin, "?search=bea")).toEqual([c]);
      expect(await ids(admin, "?search=FIL-2")).toEqual([b]);
      expect((await ids(admin, `?search=PRJ-${case2.number}`))).toEqual([c]);
      const rows = (await as(admin).get("/api/v1/filings")).body.data as Array<{ id: string; late: boolean }>;
      // a: next action 3 days ago and not approved -> late. b: approved, so never late. c: in the future.
      expect(Object.fromEntries(rows.map((r) => [r.id, r.late]))).toEqual({ [a]: true, [b]: false, [c]: false });
    });

    it("sorts, paginates, and rejects bad paging with a message on the field", async () => {
      expect(await ids(admin)).toEqual([c, b, a]); // newest number first
      expect(await ids(admin, "?sort=number&order=asc")).toEqual([a, b, c]);
      expect(await ids(admin, "?sort=nextActionDate&order=asc")).toEqual([a, b, c]);
      expect(await ids(admin, "?sort=type&order=asc")).toEqual([c, a, b]);
      const page = await as(admin).get("/api/v1/filings?limit=2&page=2&sort=number&order=asc");
      expect(page.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
      const bad = await as(admin).get("/api/v1/filings?page=0&limit=101&status=GONE");
      expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["limit", "page", "status"]);
      expect((await as(admin).get("/api/v1/filings?sort=reference")).body.errors[0].field).toBe("sort");
    });

    it("lists one case's filings, and gives 404 for a case that doesn't exist or isn't visible", async () => {
      const res = await as(compliance).get(`/api/v1/cases/${case1.id}/filings`);
      expect(res.body.data.map((f: { id: string }) => f.id).sort()).toEqual([a, b].sort());
      expect((await as(compliance).get("/api/v1/cases/nope/filings")).status).toBe(404);
      await t.prisma.case.update({ where: { id: case1.id }, data: { deletedAt: new Date() } });
      expect((await as(compliance).get(`/api/v1/cases/${case1.id}/filings`)).status).toBe(404);
    });
  });

  describe("reminders", () => {
    const remind = (who: User, caseId = case1.id, body: Record<string, unknown> = {}) =>
      as(who).post(`/api/v1/cases/${caseId}/reminders`).send({ title: "Delaware annual report", date: "2031-03-01", kind: "annual", ...body });

    it("are always illustrative, with wording that never calls them a legal deadline", async () => {
      const created = await remind(compliance);
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({
        title: "Delaware annual report",
        date: "2031-03-01",
        kind: "annual",
        illustrative: true,
        note: "Illustrative reminder: confirm the real date with the state. It is not a legal deadline.",
      });
      const listed = await as(manager).get(`/api/v1/cases/${case1.id}/reminders`);
      expect(listed.body.data).toHaveLength(1);
      expect(listed.body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
      const removed = await as(admin).delete(`/api/v1/cases/${case1.id}/reminders/${created.body.data.id}`);
      expect(removed.status).toBe(200);

      // Every sentence in every reminder response that mentions a deadline says it is NOT one.
      const texts = JSON.stringify([created.body, listed.body, removed.body]).match(/"[^"]*deadline[^"]*"/gi) ?? [];
      expect(texts.length).toBeGreaterThan(0);
      for (const text of texts) expect(text.toLowerCase()).toContain("not a legal deadline");
      expect(created.body.message).toBe("Reminder added. It is illustrative: confirm the real date with the state.");
    });

    it("can't be stored as anything but illustrative", async () => {
      const res = await remind(admin, case1.id, { illustrative: false });
      expect(res.status).toBe(422);
      expect(res.body.errors[0]).toEqual({ field: "illustrative", message: "property illustrative should not exist" });
      await remind(admin);
      expect(await t.prisma.reminder.count({ where: { illustrative: false } })).toBe(0);
    });

    it("lists them by date and audits additions and removals", async () => {
      await remind(admin, case1.id, { title: "Later", date: "2031-09-01" });
      const first = await remind(admin, case1.id, { title: "Sooner", date: "2031-02-01" });
      const list = await as(admin).get(`/api/v1/cases/${case1.id}/reminders`);
      expect(list.body.data.map((r: { title: string }) => r.title)).toEqual(["Sooner", "Later"]);
      expect(await t.prisma.auditLog.count({ where: { action: `Added illustrative reminder “Sooner” (2031-02-01) on PRJ-${case1.number}` } })).toBe(1);
      await as(admin).delete(`/api/v1/cases/${case1.id}/reminders/${first.body.data.id}`);
      expect(await t.prisma.auditLog.count({ where: { action: `Removed reminder “Sooner” from PRJ-${case1.number}` } })).toBe(1);
    });

    it("validates the fields, and keeps each reminder to its own case", async () => {
      const bad = await as(admin).post(`/api/v1/cases/${case1.id}/reminders`).send({ title: "t".repeat(201), date: "01/03/2031", kind: "k".repeat(41) });
      expect(bad.status).toBe(422);
      expect(bad.body.errors).toEqual(
        expect.arrayContaining([
          { field: "title", message: "The title can't be longer than 200 characters." },
          { field: "date", message: "Enter the reminder date as YYYY-MM-DD." },
          { field: "kind", message: "The kind can't be longer than 40 characters." },
        ]),
      );
      expect((await remind(admin, case1.id, { title: "   " })).body.errors[0]).toEqual({ field: "title", message: "Enter a reminder title." });
      const other = await remind(admin, case2.id);
      expect((await as(admin).delete(`/api/v1/cases/${case1.id}/reminders/${other.body.data.id}`)).status).toBe(404);
      expect((await remind(admin, "nope")).status).toBe(404);
      expect((await as(admin).get("/api/v1/cases/nope/reminders")).status).toBe(404);
    });

    it("can be added to a completed case", async () => {
      await t.prisma.case.update({ where: { id: case1.id }, data: { stage: "COMPLETED", status: "COMPLETED", completedAt: new Date() } });
      expect((await remind(admin)).status).toBe(201);
    });
  });
});
