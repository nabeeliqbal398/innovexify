import { api, bearerFor, createAppWithMail, makeCase, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

type User = Awaited<ReturnType<typeof makeUser>>;
type CaseRow = Awaited<ReturnType<typeof makeCase>>;

describe("reports (e2e)", () => {
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
  let compliance2: User;
  let client1: User; // csr1's
  let client2: User; // csr2's
  let orphan: User; // no CSR
  let case1: CaseRow;
  let case2: CaseRow;

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    admin = await makeUser(t.prisma, { email: "admin@test.dev", name: "Ada Admin", role: "ADMIN" });
    manager = await makeUser(t.prisma, { email: "manager@test.dev", name: "Max Manager", role: "MANAGER" });
    csr1 = await makeUser(t.prisma, { email: "csr1@test.dev", name: "Cora CSR", role: "CSR" });
    csr2 = await makeUser(t.prisma, { email: "csr2@test.dev", name: "Carl CSR", role: "CSR" });
    compliance = await makeUser(t.prisma, { email: "comp@test.dev", name: "Cleo Compliance", role: "COMPLIANCE" });
    compliance2 = await makeUser(t.prisma, { email: "comp2@test.dev", name: "Omar Compliance", role: "COMPLIANCE" });
    client1 = await makeUser(t.prisma, { email: "client1@test.dev", name: "Alex Client", role: "CLIENT", csrId: csr1.id });
    client2 = await makeUser(t.prisma, { email: "client2@test.dev", name: "Bea Client", role: "CLIENT", csrId: csr2.id });
    orphan = await makeUser(t.prisma, { email: "orphan@test.dev", name: "Olly Orphan", role: "CLIENT" });
    case1 = await makeCase(t.prisma, { clientId: client1.id });
    case2 = await makeCase(t.prisma, { clientId: client2.id });
  });

  const as = (user: { id: string; role: Parameters<typeof bearerFor>[1]["role"] }) => api(t, bearerFor(t, user));
  const file = (who: User, clientId: string, extra: Record<string, unknown> = {}) =>
    as(who).post("/api/v1/reports").send({ clientId, title: "ITIN not available", body: "The client has no ITIN.", ...extra });
  const ids = async (who: User, query = ""): Promise<string[]> => (await as(who).get(`/api/v1/reports${query}`)).body.data.map((r: { id: string }) => r.id);
  const statusOf = async (id: string) => (await t.prisma.report.findUniqueOrThrow({ where: { id } })).status;

  describe("submitting", () => {
    it("lets a CSR report about their own client: numbered from the report counter, with an event, a notification and an audit entry", async () => {
      const res = await file(csr1, client1.id, { category: "TAX_EIN_QUESTION", priority: "HIGH", action: "Confirm the EIN route", body: "  Sarah has no ITIN.  " });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        number: 201,
        displayNumber: "RPT-201",
        title: "ITIN not available",
        body: "Sarah has no ITIN.",
        category: "TAX_EIN_QUESTION",
        priority: "HIGH",
        action: "Confirm the EIN route",
        status: "SUBMITTED",
        statusLabel: "Submitted",
        client: { id: client1.id, name: "Alex Client" },
        csr: { id: csr1.id, name: "Cora CSR" },
        case: { id: case1.id, displayNumber: `PRJ-${case1.number}` },
        messages: [],
        events: [{ status: "SUBMITTED", by: { id: csr1.id } }],
      });
      expect(res.body.message).toBe("RPT-201 sent to Compliance.");
      expect((await t.prisma.counter.findUniqueOrThrow({ where: { key: "report" } })).value).toBe(201);
      // Every active Compliance user is told; nobody else is.
      for (const who of [compliance, compliance2]) expect(await t.prisma.notification.count({ where: { userId: who.id, text: "New CSR report RPT-201 from Cora CSR", link: "reports" } })).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: { in: [admin.id, manager.id, csr2.id, client1.id] } } })).toBe(0);
      expect(await t.prisma.auditLog.count({ where: { action: "Submitted report “ITIN not available” (RPT-201)", actorId: csr1.id, category: "reports" } })).toBe(1);
    });

    it("defaults the category and priority, and links the client's current case", async () => {
      const res = await file(csr1, client1.id);
      expect(res.body.data).toMatchObject({ category: "OTHER", priority: "NORMAL", action: "", case: { id: case1.id } });
      const noCase = await file(csr1, client1.id, { title: "Another" });
      expect(noCase.body.data.case.id).toBe(case1.id);
    });

    it("accepts a case only if it belongs to that client", async () => {
      const ok = await file(csr1, client1.id, { caseId: case1.id });
      expect(ok.status).toBe(201);
      const wrong = await file(csr1, client1.id, { caseId: case2.id });
      expect(wrong.status).toBe(422);
      expect(wrong.body).toMatchObject({
        errorCode: "CASE_CLIENT_MISMATCH",
        message: `PRJ-${case2.number} doesn't belong to Alex Client. Choose one of their cases, or leave the case empty.`,
        errors: [{ field: "caseId", message: "This case belongs to a different client." }],
      });
      expect((await file(csr1, client1.id, { caseId: "nope" })).status).toBe(404);
      expect(await t.prisma.report.count()).toBe(1);
      expect((await t.prisma.counter.findUniqueOrThrow({ where: { key: "report" } })).value).toBe(201);
    });

    it("refuses a client who isn't the CSR's own, with a 404 like any client that doesn't exist", async () => {
      for (const clientId of [client2.id, orphan.id, "nobody"]) {
        const res = await file(csr1, clientId);
        expect(res.status).toBe(404);
        expect(res.body.errorCode).toBe("RESOURCE_NOT_FOUND");
      }
      expect(await t.prisma.report.count()).toBe(0);
      expect((await t.prisma.counter.findUniqueOrThrow({ where: { key: "report" } })).value).toBe(200);
    });

    it("is for CSRs only: everyone else is told so", async () => {
      for (const who of [compliance, manager, admin, client1]) {
        const res = await file(who, client1.id);
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ errorCode: "PERMISSION_DENIED" });
      }
      expect((await file(compliance, client1.id)).body.message).toBe("Only CSRs send reports to Compliance, about their own clients.");
      expect((await file(client1, client1.id)).body.message).toBe("Only CSRs send reports to Compliance, about their own clients.");
      expect(await t.prisma.report.count()).toBe(0);
    });

    it("validates each field, including the boundaries of the title and the body", async () => {
      const res = await as(csr1).post("/api/v1/reports").send({ title: "t".repeat(201), body: "b".repeat(5001), category: "GOSSIP", priority: "SOON", action: "a".repeat(501), caseId: 7, extra: 1 });
      expect(res.status).toBe(422);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          { field: "clientId", message: "Select one of your clients." },
          { field: "title", message: "The title can't be longer than 200 characters." },
          { field: "body", message: "The report can't be longer than 5000 characters." },
          { field: "category", message: expect.stringContaining("category must be one of") },
          { field: "priority", message: expect.stringContaining("priority must be one of") },
          { field: "action", message: "The requested action can't be longer than 500 characters." },
          { field: "extra", message: "property extra should not exist" },
        ]),
      );
      expect((await file(csr1, client1.id, { title: "   " })).body.errors[0]).toEqual({ field: "title", message: "Enter a title." });
      expect((await file(csr1, client1.id, { body: "" })).body.errors[0]).toEqual({ field: "body", message: "Describe what Compliance should know." });
      expect((await file(csr1, client1.id, { title: "t".repeat(200), body: "b".repeat(5000) })).status).toBe(201);
      expect((await file(csr1, client1.id, { title: "t", body: "b" })).status).toBe(201);
    });

    it("hands out unique report numbers to 20 reports filed at the same time", async () => {
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => file(csr1, client1.id, { title: `Report ${i}` })));
      expect(results.map((r) => r.status)).toEqual(Array(20).fill(201));
      expect(results.map((r) => r.body.data.number as number).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => 201 + i));
    });

    it("refuses a client who was removed", async () => {
      await t.prisma.user.update({ where: { id: client1.id }, data: { status: "REMOVED", deletedAt: new Date() } });
      expect((await file(csr1, client1.id)).status).toBe(404); // out of scope once removed
    });
  });

  describe("who can read what", () => {
    let r1: string;
    let r2: string;
    beforeEach(async () => {
      r1 = (await file(csr1, client1.id, { title: "Report by Cora" })).body.data.id;
      r2 = (await file(csr2, client2.id, { title: "Report by Carl" })).body.data.id;
    });

    it("shows a CSR only their own reports, and 404 for another CSR's on every route", async () => {
      expect(await ids(csr1)).toEqual([r1]);
      expect(await ids(csr2)).toEqual([r2]);
      expect(await ids(csr1, `?csrId=${csr2.id}`)).toEqual([]);
      expect(await ids(csr1, `?clientId=${client2.id}`)).toEqual([]);
      for (const res of [await as(csr1).get(`/api/v1/reports/${r2}`), await as(csr1).post(`/api/v1/reports/${r2}/messages`).send({ text: "Peeking" })]) {
        expect(res.status).toBe(404);
        expect(res.body.errorCode).toBe("RESOURCE_NOT_FOUND");
      }
      // Notes and status changes are Compliance's: a CSR is refused before any report is even looked up.
      for (const res of [await as(csr1).post(`/api/v1/reports/${r2}/notes`).send({ text: "Peeking" }), await as(csr1).post(`/api/v1/reports/${r2}/status`).send({ status: "ACKNOWLEDGED" })]) {
        expect(res.status).toBe(403);
      }
      const missing = await as(csr1).get("/api/v1/reports/does-not-exist");
      expect(missing.body.message.replace("does-not-exist", "X")).toBe((await as(csr1).get(`/api/v1/reports/${r2}`)).body.message.replace(r2, "X"));
      expect(await t.prisma.reportMessage.count()).toBe(0);
    });

    it("shows Compliance, Manager and Admin every report", async () => {
      for (const who of [compliance, manager, admin]) {
        expect((await ids(who)).sort()).toEqual([r1, r2].sort());
        expect((await as(who).get(`/api/v1/reports/${r2}`)).status).toBe(200);
      }
    });

    it("keeps reports from clients and from anyone not signed in", async () => {
      const res = await as(client1).get("/api/v1/reports");
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Reports are internal and visible only to staff.");
      expect((await as(client1).get(`/api/v1/reports/${r1}`)).status).toBe(403);
      expect((await api(t).get("/api/v1/reports")).status).toBe(401);
    });

    it("filters, searches, sorts and paginates", async () => {
      await t.prisma.report.update({ where: { id: r2 }, data: { priority: "URGENT", category: "FILING_QUESTION", status: "ACKNOWLEDGED" } });
      expect(await ids(admin, "?status=ACKNOWLEDGED")).toEqual([r2]);
      expect(await ids(admin, "?priority=URGENT")).toEqual([r2]);
      expect(await ids(admin, "?category=FILING_QUESTION")).toEqual([r2]);
      expect(await ids(admin, `?csrId=${csr1.id}`)).toEqual([r1]);
      expect(await ids(admin, `?clientId=${client2.id}`)).toEqual([r2]);
      expect(await ids(admin, "?search=carl")).toEqual([r2]); // matches the title "Report by Carl"
      expect(await ids(admin, "?search=bea")).toEqual([r2]);
      expect(await ids(admin, "?search=by%20cora")).toEqual([r1]);
      expect(await ids(admin, "?search=RPT-201")).toEqual([r1]);
      expect(await ids(admin, "?sort=number&order=asc")).toEqual([r1, r2]);
      expect(await ids(admin)).toEqual([r2, r1]); // newest first
      const page = await as(admin).get("/api/v1/reports?limit=1&page=2&sort=number&order=asc");
      expect(page.body.meta).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });
      expect(page.body.data[0].id).toBe(r2);
      const bad = await as(admin).get("/api/v1/reports?page=0&limit=101&status=GONE&priority=SOON");
      expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["limit", "page", "priority", "status"]);
      expect((await as(admin).get("/api/v1/reports?sort=body")).body.errors[0].field).toBe("sort");
    });
  });

  describe("compliance notes", () => {
    let report: string;
    const NOTE = "Possible name clash with an existing Texas entity; check before replying.";
    beforeEach(async () => {
      report = (await file(csr1, client1.id)).body.data.id;
      expect((await as(compliance).post(`/api/v1/reports/${report}/notes`).send({ text: NOTE })).status).toBe(201);
      expect((await as(compliance).post(`/api/v1/reports/${report}/messages`).send({ text: "Thanks, looking at this now." })).status).toBe(201);
    });

    it("are never returned to the CSR who filed the report", async () => {
      const detail = await as(csr1).get(`/api/v1/reports/${report}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.messages.map((m: { text: string }) => m.text)).toEqual(["Thanks, looking at this now."]);
      expect(detail.body.data.messages.some((m: { isNote: boolean }) => m.isNote)).toBe(false);
      expect(JSON.stringify(detail.body)).not.toContain("name clash");
    });

    it("are not in the CSR's list, replies, status changes or anything else they can call", async () => {
      const everything = JSON.stringify([
        (await as(csr1).get("/api/v1/reports")).body,
        (await as(csr1).post(`/api/v1/reports/${report}/messages`).send({ text: "Any news?" })).body,
        (await as(csr1).get(`/api/v1/reports/${report}`)).body,
      ]);
      expect(everything).not.toContain("name clash");
      expect(everything).not.toContain("Texas entity");
      // The notification a reply produces doesn't carry it either.
      expect(JSON.stringify(await t.prisma.notification.findMany({ where: { userId: csr1.id } }))).not.toContain("name clash");
    });

    it("are shown to Compliance, Manager and Admin, in order with the thread", async () => {
      for (const who of [compliance, compliance2, manager, admin]) {
        const detail = await as(who).get(`/api/v1/reports/${report}`);
        expect(detail.body.data.messages.map((m: { text: string; isNote: boolean }) => [m.isNote, m.text.slice(0, 8)])).toEqual([[true, "Possible"], [false, "Thanks, "]]);
        expect(detail.body.data.messages[0].author).toMatchObject({ id: compliance.id, name: "Cleo Compliance", role: "COMPLIANCE" });
      }
    });

    it("can be written only by Compliance, not by the CSR, a Manager or an Admin", async () => {
      for (const who of [csr1, manager, admin]) {
        const res = await as(who).post(`/api/v1/reports/${report}/notes`).send({ text: "My note" });
        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Only Compliance marks reports reviewed.");
      }
      expect(await t.prisma.reportMessage.count({ where: { isNote: true } })).toBe(1);
      expect(await t.prisma.auditLog.count({ where: { action: `Added compliance note on RPT-201` } })).toBe(1);
    });

    it("can still be added after the report is resolved, and a note can't be empty", async () => {
      await as(compliance).post(`/api/v1/reports/${report}/status`).send({ status: "REVIEWED" });
      expect((await as(compliance).post(`/api/v1/reports/${report}/notes`).send({ text: "Closing note" })).status).toBe(201);
      expect((await as(compliance).post(`/api/v1/reports/${report}/notes`).send({ text: "   " })).body.errors).toEqual([{ field: "text", message: "Write something first." }]);
    });
  });

  describe("the thread", () => {
    let report: string;
    beforeEach(async () => {
      report = (await file(csr1, client1.id)).body.data.id;
      await t.prisma.notification.deleteMany();
    });
    const reply = (who: User, text = "A reply") => as(who).post(`/api/v1/reports/${report}/messages`).send({ text });

    it("lets Compliance reply to the CSR, and the CSR reply to Compliance, each notifying the other side", async () => {
      const fromCompliance = await reply(compliance, "  Can you confirm the passport country?  ");
      expect(fromCompliance.status).toBe(201);
      expect(fromCompliance.body.data).toMatchObject({ text: "Can you confirm the passport country?", isNote: false, author: { id: compliance.id } });
      expect(await t.prisma.notification.count({ where: { userId: csr1.id, text: "Reply on RPT-201 from Cleo Compliance", link: "reports" } })).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: compliance.id } })).toBe(0); // not told about their own reply

      await reply(csr1, "It is Mexico.");
      for (const who of [compliance, compliance2]) expect(await t.prisma.notification.count({ where: { userId: who.id, text: "Reply on RPT-201 from Cora CSR" } })).toBe(1);
      expect(await t.prisma.auditLog.count({ where: { action: "Replied on RPT-201", category: "reports" } })).toBe(2);

      const detail = await as(csr1).get(`/api/v1/reports/${report}`);
      expect(detail.body.data.messages.map((m: { text: string }) => m.text)).toEqual(["Can you confirm the passport country?", "It is Mexico."]);
    });

    it("lets Manager and Admin reply too, and tells the CSR", async () => {
      for (const who of [manager, admin]) expect((await reply(who)).status).toBe(201);
      expect(await t.prisma.notification.count({ where: { userId: csr1.id } })).toBe(2);
    });

    it("puts a report back to Submitted when the CSR answers a request for clarification", async () => {
      await as(compliance).post(`/api/v1/reports/${report}/status`).send({ status: "CLARIFICATION_REQUESTED" });
      expect(await statusOf(report)).toBe("CLARIFICATION_REQUESTED");
      await reply(csr1, "Here is the missing information.");
      expect(await statusOf(report)).toBe("SUBMITTED");
      const events = (await as(admin).get(`/api/v1/reports/${report}`)).body.data.events.map((e: { status: string }) => e.status);
      expect(events).toEqual(["SUBMITTED", "CLARIFICATION_REQUESTED", "SUBMITTED"]);
      // A reply from Compliance doesn't move it.
      await as(compliance).post(`/api/v1/reports/${report}/status`).send({ status: "ACKNOWLEDGED" });
      await reply(compliance, "Noted");
      expect(await statusOf(report)).toBe("ACKNOWLEDGED");
    });

    it("accepts no more replies once the report is resolved, with a message saying so", async () => {
      await as(compliance).post(`/api/v1/reports/${report}/status`).send({ status: "REVIEWED" });
      for (const who of [csr1, compliance, manager, admin]) {
        const res = await reply(who);
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({
          errorCode: "REPORT_CLOSED",
          message: "RPT-201 was marked resolved, so it accepts no more replies. Submit a new report if there is something new to raise.",
        });
      }
      expect(await t.prisma.reportMessage.count()).toBe(0);
    });

    it("validates the reply", async () => {
      expect((await reply(csr1, "   ")).body.errors).toEqual([{ field: "text", message: "Write something first." }]);
      expect((await reply(csr1, "t".repeat(5001))).body.errors[0].message).toBe("That can't be longer than 5000 characters.");
      expect((await reply(csr1, "t".repeat(5000))).status).toBe(201);
    });

    it("keeps clients out", async () => {
      expect((await reply(client1)).status).toBe(403);
    });
  });

  describe("status", () => {
    const ALL = ["SUBMITTED", "ACKNOWLEDGED", "CLARIFICATION_REQUESTED", "REVIEWED"] as const;
    const LABEL = { SUBMITTED: "Submitted", ACKNOWLEDGED: "Acknowledged", CLARIFICATION_REQUESTED: "Clarification requested", REVIEWED: "Resolved" } as const;
    const VALID: Record<(typeof ALL)[number], string[]> = {
      SUBMITTED: ["ACKNOWLEDGED", "CLARIFICATION_REQUESTED", "REVIEWED"],
      ACKNOWLEDGED: ["CLARIFICATION_REQUESTED", "REVIEWED"],
      CLARIFICATION_REQUESTED: ["REVIEWED"],
      REVIEWED: [],
    };
    const TARGETS = ["ACKNOWLEDGED", "CLARIFICATION_REQUESTED", "REVIEWED"] as const;
    const pairs = ALL.flatMap((from) => TARGETS.map((to) => [from, to] as const));

    it.each(pairs)("from %s to %s", async (from, to) => {
      const report = (await file(csr1, client1.id)).body.data.id as string;
      await t.prisma.report.update({ where: { id: report }, data: { status: from } });
      const res = await as(compliance).post(`/api/v1/reports/${report}/status`).send({ status: to });
      if (VALID[from].includes(to)) {
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe(to);
        expect(res.body.data.statusLabel).toBe(LABEL[to]);
      } else {
        expect(res.status).toBe(409);
        expect(res.body.errorCode).toBe("INVALID_STATE_TRANSITION");
        expect(res.body.message).toContain(`A report can't move from "${LABEL[from]}" to "${LABEL[to]}".`);
        expect(await statusOf(report)).toBe(from);
      }
    });

    it("explains a resolved report is final, and an unchanged status in words", async () => {
      const report = (await file(csr1, client1.id)).body.data.id as string;
      await as(compliance).post(`/api/v1/reports/${report}/status`).send({ status: "REVIEWED" });
      expect((await as(compliance).post(`/api/v1/reports/${report}/status`).send({ status: "ACKNOWLEDGED" })).body.message).toContain("a resolved report is final");
      expect((await as(compliance).post(`/api/v1/reports/${report}/status`).send({ status: "REVIEWED" })).body.message).toContain("already resolved");
      const another = (await file(csr1, client1.id)).body.data.id as string;
      await as(compliance).post(`/api/v1/reports/${another}/status`).send({ status: "ACKNOWLEDGED" });
      expect((await as(compliance).post(`/api/v1/reports/${another}/status`).send({ status: "ACKNOWLEDGED" })).body.message).toContain("It is already in that status.");
    });

    it("writes an event, an audit entry and a notification to the CSR for every move", async () => {
      const report = (await file(csr1, client1.id)).body.data.id as string;
      await t.prisma.notification.deleteMany();
      await as(compliance).post(`/api/v1/reports/${report}/status`).send({ status: "ACKNOWLEDGED" });
      await as(compliance).post(`/api/v1/reports/${report}/status`).send({ status: "CLARIFICATION_REQUESTED" });
      await as(compliance2).post(`/api/v1/reports/${report}/status`).send({ status: "REVIEWED" });

      expect((await t.prisma.reportEvent.findMany({ where: { reportId: report }, orderBy: { at: "asc" } })).map((e) => [e.status, e.byId])).toEqual([
        ["SUBMITTED", csr1.id],
        ["ACKNOWLEDGED", compliance.id],
        ["CLARIFICATION_REQUESTED", compliance.id],
        ["REVIEWED", compliance2.id],
      ]);
      expect((await t.prisma.notification.findMany({ where: { userId: csr1.id }, orderBy: { createdAt: "asc" } })).map((n) => n.text)).toEqual([
        "RPT-201 was acknowledged by Cleo Compliance",
        "RPT-201: Clarification requested",
        "RPT-201: Resolved",
      ]);
      const audit = (await t.prisma.auditLog.findMany({ where: { category: "reports", action: { startsWith: "Marked RPT-201" } }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
      expect(audit).toEqual(["Marked RPT-201 acknowledged", "Marked RPT-201 clarification requested", "Marked RPT-201 resolved"]);
    });

    it("is Compliance's to change: not the CSR, a Manager or an Admin", async () => {
      const report = (await file(csr1, client1.id)).body.data.id as string;
      for (const who of [csr1, manager, admin, client1]) {
        const res = await as(who).post(`/api/v1/reports/${report}/status`).send({ status: "REVIEWED" });
        expect(res.status).toBe(403);
      }
      expect((await as(csr1).post(`/api/v1/reports/${report}/status`).send({ status: "REVIEWED" })).body.message).toBe("Only Compliance marks reports reviewed.");
      expect(await statusOf(report)).toBe("SUBMITTED");
    });

    it("validates the status", async () => {
      const report = (await file(csr1, client1.id)).body.data.id as string;
      for (const status of ["SUBMITTED", "DONE", "Resolved", ""]) {
        const res = await as(compliance).post(`/api/v1/reports/${report}/status`).send({ status });
        expect(res.status).toBe(422);
        expect(res.body.errors).toEqual([{ field: "status", message: "status must be ACKNOWLEDGED, CLARIFICATION_REQUESTED or REVIEWED." }]);
      }
    });

    it("lets only one of two simultaneous status changes win when both started from the same status", async () => {
      const report = (await file(csr1, client1.id)).body.data.id as string;
      const [a, b] = await Promise.all([
        as(compliance).post(`/api/v1/reports/${report}/status`).send({ status: "ACKNOWLEDGED" }),
        as(compliance2).post(`/api/v1/reports/${report}/status`).send({ status: "ACKNOWLEDGED" }),
      ]);
      // Either the loser lost the race for the write (409 concurrent) or read the winner's result (409 already).
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(await t.prisma.reportEvent.count({ where: { reportId: report, status: "ACKNOWLEDGED" } })).toBe(1);
    });
  });
});
