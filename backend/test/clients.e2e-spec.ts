import { NotificationService } from "../src/common/notifications/notification.service";
import { api, bearerFor, createAppWithMail, login, makeCase, makeUser, PASSWORD, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

describe("clients (e2e)", () => {
  let t: TestApp & { mail: RecordingMail };

  beforeAll(async () => {
    t = await createAppWithMail();
  });
  afterAll(async () => {
    await t.close();
  });

  let admin: Awaited<ReturnType<typeof makeUser>>;
  let manager: typeof admin;
  let csr1: typeof admin;
  let csr2: typeof admin;
  let compliance: typeof admin;
  let client1: typeof admin; // csr1's
  let client2: typeof admin; // csr2's

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
    await makeCase(t.prisma, { clientId: client1.id });
    await makeCase(t.prisma, { clientId: client2.id });
  });

  const as = (user: { id: string; role: Parameters<typeof bearerFor>[1]["role"] }) => api(t, bearerFor(t, user));
  const counter = async (key: string): Promise<number> => (await t.prisma.counter.findUniqueOrThrow({ where: { key } })).value;
  const year = new Date().getFullYear();

  describe("create", () => {
    it("creates the user, case ID, first case, CSR assignment, notification, audit and email in one go", async () => {
      const res = await as(admin).post("/api/v1/clients").send({
        name: "Nora Newclient",
        email: "Nora@NewCo.com",
        csrId: csr1.id,
        businessName: "NewCo LLC",
        formationState: "Texas",
        priority: "HIGH",
        deadline: "2027-03-31",
        note: "Looking forward to working with you",
      });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        email: "nora@newco.com",
        name: "Nora Newclient",
        status: "INVITED",
        caseNumber: `CASE-${year}-0041`,
        businessName: "NewCo LLC",
        formationState: "Texas",
        csr: { id: csr1.id, name: "Cora CSR" },
        case: { number: 101, displayNumber: "PRJ-101", stage: "INVITATION_SENT", status: "AWAITING_CLIENT", priority: "HIGH", deadline: "2027-03-31", serviceId: "llc" },
        caseSummary: { total: 1, open: 1, completed: 0 },
      });

      const user = await t.prisma.user.findFirstOrThrow({ where: { email: "nora@newco.com" }, include: { clientProfile: true, ownedCases: true, clientCases: { include: { events: true } } } });
      expect(user).toMatchObject({ role: "CLIENT", status: "INVITED", invitedById: admin.id, passwordHash: null });
      expect(user.clientProfile).toMatchObject({ caseNumber: `CASE-${year}-0041`, csrId: csr1.id, joinedAt: null });
      expect(user.clientCases).toHaveLength(1);
      expect(user.clientCases[0].events).toMatchObject([{ toStage: "INVITATION_SENT", byId: admin.id, note: "Case created" }]);

      // The CSR is told, the invitation went out, and the audit log has what happened.
      expect(await t.prisma.notification.count({ where: { userId: csr1.id, text: "New client assigned to you: Nora Newclient" } })).toBe(1);
      expect(t.mail.sent).toHaveLength(1);
      expect(t.mail.sent[0]).toMatchObject({ to: "nora@newco.com", kind: "invitation" });
      expect(t.mail.sent[0].text).toContain(`CASE-${year}-0041`);
      expect(t.mail.sent[0].text).toContain("Looking forward to working with you");
      expect(await t.prisma.invitationToken.count({ where: { userId: user.id } })).toBe(1);
      const audit = (await t.prisma.auditLog.findMany({ where: { target: `CASE-${year}-0041` }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
      expect(audit).toEqual(expect.arrayContaining(["Invited Client nora@newco.com", "Created case PRJ-101 (LLC formation)", "Assigned CSR Cora CSR"]));

      expect(await counter("client")).toBe(41);
      expect(await counter("case")).toBe(101);
    });

    it("accepts the invitation and the client can sign in and see their own record", async () => {
      await as(admin).post("/api/v1/clients").send({ name: "Nora", email: "nora@newco.com", csrId: csr1.id });
      const token = t.mail.inviteTokenFor("nora@newco.com");
      const accept = await t.http().post("/api/v1/auth/accept-invitation").send({ token, password: PASSWORD });
      expect(accept.status).toBe(200);
      const { accessToken } = await login(t, "nora@newco.com");
      const me = await api(t, `Bearer ${accessToken}`).get("/api/v1/clients");
      expect(me.status).toBe(403);
      const id = accept.body.data.user.id;
      const own = await api(t, `Bearer ${accessToken}`).get(`/api/v1/clients/${id}`);
      expect(own.status).toBe(200);
      expect(own.body.data.status).toBe("ACTIVE");
      // The CSR hears that the client accepted.
      expect(await t.prisma.notification.count({ where: { userId: csr1.id, text: "Nora accepted the invitation" } })).toBe(1);
    });

    it("lets Admin and Manager create a client without a CSR, and the client shows up as unassigned", async () => {
      const res = await as(manager).post("/api/v1/clients").send({ email: "nocsr@test.dev" });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ name: "nocsr", csr: null });
      const unassigned = await as(admin).get("/api/v1/clients?csrId=none");
      expect(unassigned.body.data.map((c: { email: string }) => c.email)).toEqual(["nocsr@test.dev"]);
    });

    it("makes a CSR name a CSR for the client, and accepts 'me'", async () => {
      const without = await as(csr1).post("/api/v1/clients").send({ email: "a@test.dev" });
      expect(without.status).toBe(422);
      expect(without.body.errorCode).toBe("CSR_REQUIRED");
      expect(without.body.errors).toEqual([{ field: "csrId", message: "Choose a CSR for this client." }]);

      const mine = await as(csr1).post("/api/v1/clients").send({ email: "b@test.dev", csrId: "me" });
      expect(mine.status).toBe(201);
      expect(mine.body.data.csr.id).toBe(csr1.id);
      // Their own new client is visible to them straight away.
      expect((await as(csr1).get(`/api/v1/clients/${mine.body.data.id}`)).status).toBe(200);

      const other = await as(csr1).post("/api/v1/clients").send({ email: "c@test.dev", csrId: csr2.id });
      expect(other.status).toBe(201);
      expect(other.body.data.csr.id).toBe(csr2.id);
      // ...but one handed to a colleague is no longer theirs to open.
      expect((await as(csr1).get(`/api/v1/clients/${other.body.data.id}`)).status).toBe(404);
    });

    it.each([
      ["Compliance", () => compliance],
      ["a client", () => client1],
    ])("refuses %s", async (_label, who) => {
      const res = await as(who()).post("/api/v1/clients").send({ email: "x@test.dev" });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Only Admin, Manager and CSR can invite clients.");
    });

    it("refuses a duplicate email case-insensitively, naming it, and creates nothing", async () => {
      const before = { clients: await counter("client"), cases: await counter("case") };
      const res = await as(admin).post("/api/v1/clients").send({ email: "CLIENT1@test.dev" });
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe("EMAIL_IN_USE");
      expect(res.body.message).toContain("client1@test.dev");
      expect(await counter("client")).toBe(before.clients);
      expect(await counter("case")).toBe(before.cases);
    });

    it("refuses a CSR who is not a CSR, is suspended, or doesn't exist", async () => {
      const suspended = await makeUser(t.prisma, { email: "sus@test.dev", name: "Sam Suspended", role: "CSR", status: "SUSPENDED" });
      const notCsr = await as(admin).post("/api/v1/clients").send({ email: "a@test.dev", csrId: compliance.id });
      expect(notCsr.status).toBe(422);
      expect(notCsr.body).toMatchObject({ errorCode: "INVALID_CSR_ASSIGNMENT" });
      expect(notCsr.body.message).toContain("Only users with the CSR role");

      const inactive = await as(admin).post("/api/v1/clients").send({ email: "b@test.dev", csrId: suspended.id });
      expect(inactive.body.errorCode).toBe("INVALID_CSR_ASSIGNMENT");
      expect(inactive.body.message).toContain("isn't active");

      const missing = await as(admin).post("/api/v1/clients").send({ email: "c@test.dev", csrId: "nobody" });
      expect(missing.body.errorCode).toBe("INVALID_CSR_ASSIGNMENT");
      expect(missing.body.message).toContain("couldn't find that CSR");
      expect(await t.prisma.user.count({ where: { email: { in: ["a@test.dev", "b@test.dev", "c@test.dev"] } } })).toBe(0);
    });

    it("refuses an unknown or switched-off service", async () => {
      const inactive = await as(admin).post("/api/v1/clients").send({ email: "a@test.dev", serviceId: "address" });
      expect(inactive.status).toBe(422);
      expect(inactive.body).toMatchObject({ errorCode: "SERVICE_INACTIVE", errors: [{ field: "serviceId", message: "This service is not active." }] });
      const unknown = await as(admin).post("/api/v1/clients").send({ email: "b@test.dev", serviceId: "nope" });
      expect(unknown.status).toBe(422);
      expect(unknown.body.errorCode).toBe("VALIDATION_FAILED");
      expect(unknown.body.errors[0].field).toBe("serviceId");
    });

    it("validates the fields", async () => {
      const res = await as(admin).post("/api/v1/clients").send({
        email: "nope",
        businessName: "x".repeat(161),
        formationState: "Narnia",
        priority: "SOON",
        deadline: "2027-02-30",
        note: "n".repeat(501),
      });
      expect(res.status).toBe(422);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          { field: "email", message: "Enter a valid email address." },
          { field: "businessName", message: "The business name can't be longer than 160 characters." },
          { field: "formationState", message: "Choose a formation state: Wyoming, Delaware, New Mexico, Florida, Texas." },
          { field: "priority", message: expect.stringContaining("priority must be one of") },
          { field: "deadline", message: "Enter a real target date as YYYY-MM-DD." },
          { field: "note", message: "The note can't be longer than 500 characters." },
        ]),
      );
    });

    it("keeps the client when the invitation email can't be sent, says so, audits it and allows a resend", async () => {
      t.mail.failWith = new Error("SMTP is down");
      const res = await as(admin).post("/api/v1/clients").send({ email: "kept@test.dev", name: "Kay Kept", csrId: csr1.id });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ email: "kept@test.dev", status: "INVITED", invitationEmailSent: false, case: { stage: "INVITATION_SENT" } });
      expect(res.body.message).toBe('Client created, but the invitation email to kept@test.dev could not be sent. Use "Resend invitation" to try again.');

      // Everything else was committed.
      const user = await t.prisma.user.findFirstOrThrow({ where: { email: "kept@test.dev" }, include: { clientProfile: true, clientCases: true } });
      expect(user.clientProfile?.csrId).toBe(csr1.id);
      expect(user.clientCases).toHaveLength(1);
      expect(await t.prisma.invitationToken.count({ where: { userId: user.id } })).toBe(1);
      expect(await counter("client")).toBe(41);
      expect(t.mail.sent).toHaveLength(0);
      const failure = await t.prisma.auditLog.findFirstOrThrow({ where: { action: { startsWith: "Invitation email to kept@test.dev could not be sent" } } });
      expect(failure).toMatchObject({ ok: false, category: "users", actorId: admin.id });

      // "Resend invitation" works once the mail system is back, and the first (never delivered) link is retired.
      t.mail.failWith = null;
      const resend = await as(admin).post(`/api/v1/users/${user.id}/resend-invitation`).send();
      expect(resend.status).toBe(200);
      expect(t.mail.sent).toHaveLength(1);
      expect(t.mail.sent[0]).toMatchObject({ to: "kept@test.dev", kind: "invitation" });
      expect((await t.http().get(`/api/v1/auth/invitations/${t.mail.inviteTokenFor("kept@test.dev")}`)).status).toBe(200);
    });

    it("reports invitationEmailSent: true when the email went out", async () => {
      const res = await as(admin).post("/api/v1/clients").send({ email: "sent@test.dev" });
      expect(res.body.data.invitationEmailSent).toBe(true);
      expect(res.body.message).toBe("Client invited. The invitation was sent to sent@test.dev.");
    });

    it("rolls everything back when the notification step throws", async () => {
      const before = { clients: await counter("client"), cases: await counter("case"), users: await t.prisma.user.count() };
      const spy = jest.spyOn(t.app.get(NotificationService), "notify").mockRejectedValueOnce(new Error("notification store is down"));
      try {
        const res = await as(admin).post("/api/v1/clients").send({ email: "doomed2@test.dev", csrId: csr1.id });
        expect(res.status).toBe(500);
      } finally {
        spy.mockRestore();
      }
      expect(t.mail.sent).toHaveLength(0);
      await expectNothingLeftBehind("doomed2@test.dev", before);
    });

    async function expectNothingLeftBehind(email: string, before: { clients: number; cases: number; users: number }) {
      expect(await t.prisma.user.count({ where: { email } })).toBe(0);
      expect(await t.prisma.user.count()).toBe(before.users);
      expect(await t.prisma.clientProfile.count()).toBe(2);
      expect(await t.prisma.case.count()).toBe(2);
      expect(await t.prisma.invitationToken.count()).toBe(0);
      expect(await t.prisma.auditLog.count({ where: { action: { contains: email } } })).toBe(0);
      expect(await t.prisma.notification.count({ where: { text: { contains: "New client assigned" } } })).toBe(0);
      // The numbers were never consumed, so the next client gets the next number in line.
      expect(await counter("client")).toBe(before.clients);
      expect(await counter("case")).toBe(before.cases);
    }

    it("hands out unique case IDs and case numbers to 20 clients created in parallel", async () => {
      const emails = Array.from({ length: 20 }, (_, i) => `parallel${i}@test.dev`);
      const results = await Promise.all(emails.map((email, i) => as(i % 2 ? admin : manager).post("/api/v1/clients").send({ email, csrId: i % 3 ? csr1.id : csr2.id })));
      expect(results.map((r) => r.status)).toEqual(Array(20).fill(201));

      const caseNumbers = results.map((r) => r.body.data.caseNumber as string);
      const caseCodes = results.map((r) => r.body.data.case.number as number);
      expect(new Set(caseNumbers).size).toBe(20);
      expect(new Set(caseCodes).size).toBe(20);
      // No gaps either: exactly the next 20 numbers in each sequence.
      expect(caseNumbers.map((n) => Number(n.slice(-4))).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => 41 + i));
      expect([...caseCodes].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => 101 + i));
      expect(await counter("client")).toBe(60);
      expect(await counter("case")).toBe(120);
      expect(t.mail.sent.filter((m) => m.kind === "invitation")).toHaveLength(20);
    });
  });

  describe("scope", () => {
    it("shows a CSR only their own clients in the list, and 404 for another CSR's client", async () => {
      const list = await as(csr1).get("/api/v1/clients");
      expect(list.status).toBe(200);
      expect(list.body.data.map((c: { id: string }) => c.id)).toEqual([client1.id]);
      expect(list.body.meta.total).toBe(1);

      const other = await as(csr1).get(`/api/v1/clients/${client2.id}`);
      expect(other.status).toBe(404);
      expect(other.body.errorCode).toBe("RESOURCE_NOT_FOUND");
      // The answer is the same as for a client that doesn't exist, so existence isn't leaked.
      const missing = await as(csr1).get("/api/v1/clients/does-not-exist");
      expect(missing.status).toBe(404);
      expect(other.body.message.replace(client2.id, "X")).toBe(missing.body.message.replace("does-not-exist", "X"));

      expect((await as(csr1).get(`/api/v1/clients/${client1.id}`)).status).toBe(200);
    });

    it("gives a CSR 404, not 403, on every write to another CSR's client", async () => {
      for (const res of [
        await as(csr1).patch(`/api/v1/clients/${client2.id}/profile`).send({ phone: "+1 555 0100 200" }),
        await as(csr1).patch(`/api/v1/clients/${client2.id}/csr`).send({ csrId: csr1.id }),
        await as(csr1).post(`/api/v1/users/${client2.id}/resend-invitation`).send(),
      ]) {
        expect(res.status).toBe(404);
        expect(res.body.errorCode).toBe("RESOURCE_NOT_FOUND");
      }
    });

    it("lets Admin, Manager and Compliance see every client", async () => {
      for (const who of [admin, manager, compliance]) {
        const list = await as(who).get("/api/v1/clients");
        expect(list.body.meta.total).toBe(2);
        expect((await as(who).get(`/api/v1/clients/${client2.id}`)).status).toBe(200);
      }
    });

    it("lets a client open only their own record, and 404 for another client's", async () => {
      expect((await as(client1).get(`/api/v1/clients/${client1.id}`)).status).toBe(200);
      const other = await as(client1).get(`/api/v1/clients/${client2.id}`);
      expect(other.status).toBe(404);
      expect(other.body.errorCode).toBe("RESOURCE_NOT_FOUND");
      expect((await as(client1).get("/api/v1/clients")).status).toBe(403);
    });

    it("hides a removed client from everyone but Admin and Manager", async () => {
      await as(admin).delete(`/api/v1/users/${client1.id}`);
      expect((await as(csr1).get(`/api/v1/clients/${client1.id}`)).status).toBe(404);
      expect((await as(compliance).get(`/api/v1/clients/${client1.id}`)).status).toBe(404);
      expect((await as(manager).get(`/api/v1/clients/${client1.id}`)).body.data.status).toBe("REMOVED");
      expect((await as(csr1).get("/api/v1/clients")).body.meta.total).toBe(0);
      expect((await as(admin).get("/api/v1/clients")).body.meta.total).toBe(1);
      expect((await as(admin).get("/api/v1/clients?status=REMOVED")).body.data.map((c: { id: string }) => c.id)).toEqual([client1.id]);
    });
  });

  describe("list and get", () => {
    it("filters by status, CSR and state, and searches name, email, business and case ID", async () => {
      await makeUser(t.prisma, { email: "pending@test.dev", name: "Pat Pending", role: "CLIENT", status: "INVITED", password: false });
      const caseNumber = (await t.prisma.clientProfile.findUniqueOrThrow({ where: { userId: client2.id } })).caseNumber;

      expect((await as(admin).get("/api/v1/clients?status=INVITED")).body.data.map((c: { email: string }) => c.email)).toEqual(["pending@test.dev"]);
      expect((await as(admin).get(`/api/v1/clients?csrId=${csr2.id}`)).body.data.map((c: { id: string }) => c.id)).toEqual([client2.id]);
      expect((await as(admin).get("/api/v1/clients?state=wyoming")).body.data.map((c: { id: string }) => c.id)).toEqual([client1.id]);
      expect((await as(admin).get("/api/v1/clients?search=northfield")).body.data.map((c: { id: string }) => c.id)).toEqual([client1.id]);
      expect((await as(admin).get("/api/v1/clients?search=BEA")).body.data.map((c: { id: string }) => c.id)).toEqual([client2.id]);
      expect((await as(admin).get(`/api/v1/clients?search=${caseNumber}`)).body.data.map((c: { id: string }) => c.id)).toEqual([client2.id]);
      expect((await as(admin).get("/api/v1/clients?search=client2%40")).body.data).toHaveLength(1);
      // A CSR's filter can't widen their scope.
      expect((await as(csr1).get(`/api/v1/clients?csrId=${csr2.id}`)).body.data).toEqual([]);
    });

    it("sorts and paginates, and rejects bad paging with a message on the field", async () => {
      const byBusiness = await as(admin).get("/api/v1/clients?sort=businessName&order=desc");
      expect(byBusiness.body.data.map((c: { businessName: string }) => c.businessName)).toEqual(["Northfield Studio LLC", "Bluewater Analytics LLC"]);
      const page = await as(admin).get("/api/v1/clients?limit=1&page=2&sort=name");
      expect(page.body.meta).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });
      expect(page.body.data.map((c: { name: string }) => c.name)).toEqual(["Bea Client"]);

      const bad = await as(admin).get("/api/v1/clients?page=0&limit=101");
      expect(bad.status).toBe(422);
      expect(bad.body.errors).toEqual(expect.arrayContaining([{ field: "page", message: "page must be 1 or greater." }, { field: "limit", message: "limit can't be more than 100. Ask for a smaller page." }]));
      expect((await as(admin).get("/api/v1/clients?sort=email;drop")).status).toBe(422);
      expect((await as(admin).get("/api/v1/clients?sort=passwordHash")).body.errors[0].field).toBe("sort");
    });

    it("returns the profile, assigned CSR and a case summary", async () => {
      await t.prisma.case.updateMany({ where: { clientId: client1.id }, data: { stage: "COMPLETED", status: "COMPLETED" } });
      const res = await as(admin).get(`/api/v1/clients/${client1.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: client1.id,
        businessName: "Northfield Studio LLC",
        formationState: "Wyoming",
        csr: { id: csr1.id, name: "Cora CSR" },
        caseSummary: { total: 1, open: 0, completed: 1 },
      });
      expect(res.body.data.cases).toHaveLength(1);
      expect(res.body.data.passwordHash).toBeUndefined();
    });
  });

  describe("table extras and quick filters", () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    const nextWeek = new Date(Date.now() + 7 * 86_400_000);

    it("returns last contact, next follow-up and onboarding progress, counted by hand", async () => {
      // Client 1: a staff message (older), an interaction (newer) and a completed follow-up (newest) -> the newest is the last contact.
      await t.prisma.message.create({ data: { clientId: client1.id, senderId: csr1.id, text: "hi", createdAt: new Date("2026-05-01T10:00:00.000Z") } });
      await t.prisma.message.create({ data: { clientId: client1.id, senderId: client1.id, text: "client reply is not contact", createdAt: new Date("2026-09-01T10:00:00.000Z") } });
      await t.prisma.interaction.create({ data: { clientId: client1.id, byId: csr1.id, kind: "CALL", text: "called", at: new Date("2026-06-01T10:00:00.000Z") } });
      await t.prisma.followUp.create({ data: { clientId: client1.id, csrId: csr1.id, type: "EMAIL", due: new Date("2026-06-15"), note: "n", status: "DONE", doneAt: new Date("2026-06-20T10:00:00.000Z") } });
      await t.prisma.followUp.create({ data: { clientId: client1.id, csrId: csr1.id, type: "CALL", due: nextWeek, note: "later" } });
      await t.prisma.followUp.create({ data: { clientId: client1.id, csrId: csr1.id, type: "PORTAL_MESSAGE", due: yesterday, note: "sooner" } });
      // Onboarding for client 1: active (1) + no phone/address (0) + has a case (1) + case at Invitation Sent (0) + no owed documents (1) = 3 of 5.
      const res = await as(admin).get(`/api/v1/clients?search=Alex`);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        lastContactAt: "2026-06-20T10:00:00.000Z",
        nextFollowUp: { type: "PORTAL_MESSAGE", due: yesterday.toISOString().slice(0, 10) },
        onboarding: { done: 3, total: 5 },
      });
      // Giving a phone, and a stage at review, adds two more; an owed document takes one away.
      await t.prisma.clientProfile.update({ where: { userId: client1.id }, data: { phone: "+1 555 0100" } });
      await t.prisma.case.updateMany({ where: { clientId: client1.id }, data: { stage: "DOCUMENTS_UNDER_REVIEW" } });
      const better = await as(admin).get(`/api/v1/clients/${client1.id}`);
      expect(better.body.data.onboarding).toEqual({ done: 5, total: 5 });
      await t.prisma.document.create({ data: { clientId: client1.id, name: "Passport", status: "REQUESTED" } });
      expect((await as(admin).get(`/api/v1/clients/${client1.id}`)).body.data.onboarding).toEqual({ done: 4, total: 5 });
    });

    it("gives clients with nothing recorded null contact and follow-up", async () => {
      const res = await as(admin).get(`/api/v1/clients?search=Bea`);
      expect(res.body.data[0]).toMatchObject({ lastContactAt: null, nextFollowUp: null });
    });

    it("shows a CSR only their own follow-ups, and Compliance none", async () => {
      await t.prisma.followUp.create({ data: { clientId: client1.id, csrId: csr1.id, type: "CALL", due: nextWeek, note: "n" } });
      expect((await as(csr1).get("/api/v1/clients")).body.data[0].nextFollowUp).toMatchObject({ type: "CALL" });
      expect((await as(compliance).get("/api/v1/clients?search=Alex")).body.data[0].nextFollowUp).toBeNull();
      // Another CSR's follow-up on a client that CSR can see is not shown: csr2 cannot see client 1 at all.
      expect((await as(csr2).get(`/api/v1/clients/${client1.id}`)).status).toBe(404);
    });

    it("filters: due, invited, waiting", async () => {
      await t.prisma.followUp.create({ data: { clientId: client1.id, csrId: csr1.id, type: "CALL", due: yesterday, note: "overdue" } });
      await t.prisma.followUp.create({ data: { clientId: client2.id, csrId: csr2.id, type: "CALL", due: nextWeek, note: "not yet" } });
      const names = async (user: Parameters<typeof as>[0], query: string): Promise<string[]> => (await as(user).get(`/api/v1/clients?${query}`)).body.data.map((c: { name: string }) => c.name);
      expect(await names(admin, "filter=due")).toEqual(["Alex Client"]);
      // Compliance has no follow-ups to see, so "due" finds nothing for them; a CSR's filter only counts their own.
      expect(await names(compliance, "filter=due")).toEqual([]);
      expect(await names(csr2, "filter=due")).toEqual([]);

      const invited = await makeUser(t.prisma, { email: "pending@test.dev", name: "Pat Pending", role: "CLIENT", status: "INVITED", password: false, csrId: csr1.id });
      expect(await names(admin, "filter=invited")).toEqual(["Pat Pending"]);
      expect(await names(csr2, "filter=invited")).toEqual([]);

      await t.prisma.document.create({ data: { clientId: client2.id, name: "Lease", status: "REJECTED" } });
      await t.prisma.case.updateMany({ where: { clientId: client1.id }, data: { status: "AWAITING_CLIENT" } });
      expect((await names(admin, "filter=waiting")).sort()).toEqual(["Alex Client", "Bea Client"]);
      await t.prisma.case.updateMany({ where: { clientId: client1.id }, data: { status: "ACTIVE" } });
      expect(await names(admin, "filter=waiting")).toEqual(["Bea Client"]);
      expect(invited.id).toBeTruthy();
      const bad = await as(admin).get("/api/v1/clients?filter=nonsense");
      expect(bad.status).toBe(422);
      expect(bad.body.errors[0].field).toBe("filter");
    });
  });

  describe("timeline", () => {
    beforeEach(async () => {
      const kase = await t.prisma.case.findFirstOrThrow({ where: { clientId: client1.id } });
      await t.prisma.caseEvent.create({ data: { caseId: kase.id, toStage: "CLIENT_ONBOARDING", byId: admin.id, note: "Moved on", at: new Date("2026-06-01T10:00:00.000Z") } });
      const doc = await t.prisma.document.create({ data: { clientId: client1.id, name: "Passport", status: "REJECTED" } });
      await t.prisma.documentEvent.create({ data: { documentId: doc.id, status: "SUBMITTED", byId: client1.id, note: "uploaded", at: new Date("2026-06-02T10:00:00.000Z") } });
      await t.prisma.documentEvent.create({ data: { documentId: doc.id, status: "REJECTED", byId: compliance.id, note: "Photo is blurry", at: new Date("2026-06-03T10:00:00.000Z") } });
      await t.prisma.ticket.create({ data: { number: 7001, clientId: client1.id, title: "Help me", category: "GENERAL_REQUEST", description: "d", createdAt: new Date("2026-06-04T10:00:00.000Z") } });
      await t.prisma.message.create({ data: { clientId: client1.id, senderId: client1.id, text: "x".repeat(120), createdAt: new Date("2026-06-05T10:00:00.000Z") } });
      await t.prisma.interaction.create({ data: { clientId: client1.id, byId: csr1.id, kind: "CALL", text: "Called", at: new Date("2026-06-06T10:00:00.000Z") } });
      await t.prisma.followUp.create({ data: { clientId: client1.id, csrId: csr1.id, type: "EMAIL", due: new Date("2026-06-01"), note: "n", outcome: "Sent it", status: "DONE", doneAt: new Date("2026-06-07T10:00:00.000Z") } });
    });

    it("merges every source newest first, with the relationship entries for Admin, Manager and the client's CSR", async () => {
      for (const who of [admin, manager, csr1]) {
        const res = await as(who).get(`/api/v1/clients/${client1.id}/timeline`);
        expect(res.status).toBe(200);
        // The invitation entry is dated when the account was made (now), so it is checked separately from the order of the rest.
        const kinds = res.body.data.map((e: { kind: string }) => e.kind).filter((k: string) => k !== "INVITATION");
        expect(kinds.slice(0, 7)).toEqual(["FOLLOW_UP", "INTERACTION", "MESSAGE", "TICKET", "DOCUMENT", "DOCUMENT", "CASE"]);
        expect(res.body.data.map((e: { kind: string }) => e.kind)).toContain("INVITATION");
        const rest = res.body.data.filter((e: { kind: string }) => e.kind !== "INVITATION");
        expect(rest[0]).toMatchObject({ text: "Sent it", actor: { id: csr1.id } });
        expect(rest[2].text).toHaveLength(93); // 90 characters and an ellipsis
      }
    });

    it("hides document notes from a CSR but shows them to Admin and Compliance", async () => {
      const note = async (who: Parameters<typeof as>[0]) => (await as(who).get(`/api/v1/clients/${client1.id}/timeline?relationship=false`)).body.data.find((e: { subKind: string }) => e.subKind === "REJECTED").note;
      expect(await note(csr1)).toBe("");
      expect(await note(admin)).toBe("Photo is blurry");
      expect(await note(compliance)).toBe("Photo is blurry");
    });

    it("leaves out the relationship entries for Compliance and when asked", async () => {
      const kinds = async (who: Parameters<typeof as>[0], q = "") => (await as(who).get(`/api/v1/clients/${client1.id}/timeline${q}`)).body.data.map((e: { kind: string }) => e.kind);
      expect(await kinds(compliance)).not.toEqual(expect.arrayContaining(["INTERACTION"]));
      expect(await kinds(compliance)).not.toContain("INVITATION");
      expect(await kinds(admin, "?relationship=false")).not.toContain("FOLLOW_UP");
    });

    it("limits the entries, validates, and is scoped: another CSR gets 404, a client 403", async () => {
      expect((await as(admin).get(`/api/v1/clients/${client1.id}/timeline?limit=3`)).body.data).toHaveLength(3);
      expect((await as(admin).get(`/api/v1/clients/${client1.id}/timeline?limit=101`)).body.errors[0].field).toBe("limit");
      expect((await as(csr2).get(`/api/v1/clients/${client1.id}/timeline`)).status).toBe(404);
      expect((await as(client1).get(`/api/v1/clients/${client1.id}/timeline`)).status).toBe(403);
    });
  });

  describe("profile", () => {
    it("lets Admin and Manager change every field, and audits it", async () => {
      const res = await as(manager).patch(`/api/v1/clients/${client1.id}/profile`).send({
        businessName: "Northfield Studio Inc.",
        formationState: "Delaware",
        phone: "+1 (307) 555-0142",
        address: "1200 Main St, Cheyenne, WY",
        contactPreference: "PHONE",
        preferredName: "Alex",
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ businessName: "Northfield Studio Inc.", formationState: "Delaware", phone: "+1 (307) 555-0142", contactPreference: "PHONE", preferredName: "Alex" });
      const audit = await t.prisma.auditLog.findFirst({ where: { action: { startsWith: "Updated profile of Alex Client" } } });
      expect(audit?.action).toContain("businessName");
      expect(audit?.actorId).toBe(manager.id);
    });

    it("lets a client change their own phone, address, preferred name and contact preference", async () => {
      const res = await as(client1).patch(`/api/v1/clients/${client1.id}/profile`).send({ phone: "0044 20 7946 0958", address: "1 High St", contactPreference: "EMAIL", preferredName: "Lex" });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ phone: "0044 20 7946 0958", address: "1 High St", contactPreference: "EMAIL", preferredName: "Lex" });
      expect(await t.prisma.auditLog.count({ where: { actorId: client1.id, action: { startsWith: "Updated own contact information" } } })).toBe(1);

      const cleared = await as(client1).patch(`/api/v1/clients/${client1.id}/profile`).send({ phone: "" });
      expect(cleared.status).toBe(200);
      expect(cleared.body.data.phone).toBe("");
    });

    it("keeps business name and formation state for Admin and Manager, and a client to their own record", async () => {
      const locked = await as(client1).patch(`/api/v1/clients/${client1.id}/profile`).send({ businessName: "Mine Now LLC", formationState: "Texas" });
      expect(locked.status).toBe(403);
      expect(locked.body.errorCode).toBe("PERMISSION_DENIED");
      expect(locked.body.message).toContain("businessName and formationState can only be changed by Admin and Manager");

      const other = await as(client1).patch(`/api/v1/clients/${client2.id}/profile`).send({ phone: "+1 555 0100 200" });
      expect(other.status).toBe(404);

      for (const who of [csr1, compliance]) {
        const res = await as(who).patch(`/api/v1/clients/${client1.id}/profile`).send({ phone: "+1 555 0100 200" });
        expect(res.status).toBe(403);
        expect(res.body.message).toContain("Only Admin and Manager can create cases or edit case details");
      }
    });

    it("enforces the phone, address and other length limits with a message on the field", async () => {
      const res = await as(admin).patch(`/api/v1/clients/${client1.id}/profile`).send({
        phone: "call me maybe",
        address: "a".repeat(301),
        businessName: "b".repeat(161),
        preferredName: "p".repeat(121),
        contactPreference: "PIGEON",
        formationState: "Narnia",
      });
      expect(res.status).toBe(422);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          { field: "phone", message: "Enter a phone number using digits, spaces, +, - or brackets (7 to 20 characters)." },
          { field: "address", message: "The address can't be longer than 300 characters." },
          { field: "businessName", message: "The business name can't be longer than 160 characters." },
          { field: "preferredName", message: "The preferred name can't be longer than 120 characters." },
          { field: "contactPreference", message: expect.stringContaining("contactPreference must be one of") },
          { field: "formationState", message: "Choose a formation state: Wyoming, Delaware, New Mexico, Florida, Texas." },
        ]),
      );
      // Boundaries that are allowed.
      const ok = await as(admin).patch(`/api/v1/clients/${client1.id}/profile`).send({ address: "a".repeat(300), phone: "1234567" });
      expect(ok.status).toBe(200);
      expect((await as(admin).patch(`/api/v1/clients/${client1.id}/profile`).send({ phone: "123456" })).status).toBe(422);
      expect((await as(admin).patch(`/api/v1/clients/${client1.id}/profile`).send({ phone: "1".repeat(21) })).status).toBe(422);
      expect((await as(admin).patch(`/api/v1/clients/${client1.id}/profile`).send({ phone: 5551234567 })).status).toBe(422);
    });

    it("refuses an empty change and leaves an unchanged one alone", async () => {
      const empty = await as(admin).patch(`/api/v1/clients/${client1.id}/profile`).send({});
      expect(empty.status).toBe(422);
      expect(empty.body.errors).toEqual([{ field: "body", message: "Send at least one field to change." }]);
      const before = await t.prisma.auditLog.count();
      const same = await as(admin).patch(`/api/v1/clients/${client1.id}/profile`).send({ businessName: "Northfield Studio LLC" });
      expect(same.status).toBe(200);
      expect(await t.prisma.auditLog.count()).toBe(before);
    });

    it("refuses to edit a removed client", async () => {
      await as(admin).delete(`/api/v1/users/${client1.id}`);
      const res = await as(admin).patch(`/api/v1/clients/${client1.id}/profile`).send({ phone: "+1 555 0100 200" });
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe("USER_REMOVED");
      expect(res.body.message).toContain("Alex Client");
      const csrChange = await as(admin).patch(`/api/v1/clients/${client1.id}/csr`).send({ csrId: csr2.id });
      expect(csrChange.body.errorCode).toBe("USER_REMOVED");
    });

    it("rejects an unknown field", async () => {
      const res = await as(admin).patch(`/api/v1/clients/${client1.id}/profile`).send({ csrId: csr2.id });
      expect(res.status).toBe(422);
      expect(res.body.errors[0]).toMatchObject({ field: "csrId" });
    });
  });

  describe("CSR assignment", () => {
    it("reassigns, notifies both CSRs and audits the reason", async () => {
      const res = await as(manager).patch(`/api/v1/clients/${client1.id}/csr`).send({ csrId: csr2.id, reason: "Cora is on leave" });
      expect(res.status).toBe(200);
      expect(res.body.data.csr).toEqual({ id: csr2.id, name: "Carl CSR" });
      expect((await t.prisma.clientProfile.findUniqueOrThrow({ where: { userId: client1.id } })).csrId).toBe(csr2.id);

      for (const id of [csr1.id, csr2.id]) {
        expect(await t.prisma.notification.count({ where: { userId: id, text: "Alex Client reassigned to Carl CSR" } })).toBe(1);
      }
      const audit = await t.prisma.auditLog.findFirst({ where: { action: { startsWith: "Reassigned Alex Client" } } });
      expect(audit?.action).toBe("Reassigned Alex Client from Cora CSR to Carl CSR · reason: Cora is on leave");
      expect(audit?.category).toBe("cases");
      // Scope follows the assignment at once.
      expect((await as(csr1).get(`/api/v1/clients/${client1.id}`)).status).toBe(404);
      expect((await as(csr2).get(`/api/v1/clients/${client1.id}`)).status).toBe(200);
    });

    it("refuses a CSR who is not a CSR, is suspended or is already assigned", async () => {
      const suspended = await makeUser(t.prisma, { email: "sus@test.dev", name: "Sam Suspended", role: "CSR", status: "SUSPENDED" });
      const same = await as(admin).patch(`/api/v1/clients/${client1.id}/csr`).send({ csrId: csr1.id });
      expect(same.status).toBe(422);
      expect(same.body.errorCode).toBe("CSR_UNCHANGED");
      expect(same.body.message).toBe("Cora CSR is already the CSR for Alex Client. Choose a different CSR to reassign.");

      const notCsr = await as(admin).patch(`/api/v1/clients/${client1.id}/csr`).send({ csrId: manager.id });
      expect(notCsr.body.errorCode).toBe("INVALID_CSR_ASSIGNMENT");
      const inactive = await as(admin).patch(`/api/v1/clients/${client1.id}/csr`).send({ csrId: suspended.id });
      expect(inactive.body.errorCode).toBe("INVALID_CSR_ASSIGNMENT");
      expect(inactive.body.message).toContain("isn't active");
      expect((await t.prisma.clientProfile.findUniqueOrThrow({ where: { userId: client1.id } })).csrId).toBe(csr1.id);
    });

    it("lets only Admin and Manager reassign a client who already has a CSR", async () => {
      for (const who of [csr1, compliance, client1]) {
        const res = await as(who).patch(`/api/v1/clients/${client1.id}/csr`).send({ csrId: csr2.id });
        expect([403, 404]).toContain(res.status);
      }
      const own = await as(csr1).patch(`/api/v1/clients/${client1.id}/csr`).send({ csrId: csr2.id });
      expect(own.status).toBe(403);
      expect(own.body.message).toBe("Only Admin and Manager can change the CSR of a client who already has one.");
    });

    it("assigns a CSR to a client who has none, and accepts 'me' for a CSR taking the client", async () => {
      const orphan = await makeUser(t.prisma, { email: "orphan@test.dev", name: "Olly Orphan", role: "CLIENT" });
      const res = await as(admin).patch(`/api/v1/clients/${orphan.id}/csr`).send({ csrId: csr2.id });
      expect(res.status).toBe(200);
      expect(res.body.data.csr.id).toBe(csr2.id);
      expect(await t.prisma.notification.count({ where: { userId: csr2.id, text: "New client assigned to you: Olly Orphan" } })).toBe(1);
      expect((await t.prisma.auditLog.findFirst({ where: { action: "Assigned Olly Orphan to Carl CSR" } }))?.actorId).toBe(admin.id);

      const orphan2 = await makeUser(t.prisma, { email: "orphan2@test.dev", name: "Ora Orphan", role: "CLIENT" });
      const me = await as(manager).patch(`/api/v1/clients/${orphan2.id}/csr`).send({ csrId: "me" });
      // A Manager is not a CSR, so "me" is refused.
      expect(me.status).toBe(422);
      expect(me.body.errorCode).toBe("INVALID_CSR_ASSIGNMENT");
    });

    it("validates the body", async () => {
      const res = await as(admin).patch(`/api/v1/clients/${client1.id}/csr`).send({});
      expect(res.status).toBe(422);
      expect(res.body.errors[0]).toEqual({ field: "csrId", message: "Choose a CSR." });
    });
  });
});
