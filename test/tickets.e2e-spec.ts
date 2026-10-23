import type { TicketStatus } from "@prisma/client";

import { TicketsRepository } from "../src/modules/tickets/repository/tickets.repository";
import { api, bearerFor, createAppWithMail, makeCase, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

type User = Awaited<ReturnType<typeof makeUser>>;
type Ticket = Awaited<ReturnType<TestApp["prisma"]["ticket"]["create"]>>;

const ALL: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT", "WAITING_FOR_INTERNAL_TEAM", "RESOLVED", "CLOSED"];
const LABEL: Record<TicketStatus, string> = { OPEN: "Open", IN_PROGRESS: "In Progress", WAITING_FOR_CLIENT: "Waiting for Client", WAITING_FOR_INTERNAL_TEAM: "Waiting for Internal Team", RESOLVED: "Resolved", CLOSED: "Closed" };
const ACTIVE: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT", "WAITING_FOR_INTERNAL_TEAM"];
const allowed = (from: TicketStatus, to: TicketStatus): boolean => (ACTIVE.includes(from) ? from !== to : from === "RESOLVED" ? to === "OPEN" || to === "CLOSED" : false);

describe("tickets (e2e)", () => {
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
  });

  const as = (user: { id: string; role: Parameters<typeof bearerFor>[1]["role"] }) => api(t, bearerFor(t, user));
  const open = (who: User, body: Record<string, unknown> = {}) =>
    as(who).post("/api/v1/tickets").send({ title: "My filing is late", description: "It has been three weeks.", category: "FORMATION_DELAY", ...body });
  /** A ticket straight in the database at any status. */
  let nextNumber = 2000;
  const seed = (client: User, extra: Record<string, unknown> = {}): Promise<Ticket> =>
    t.prisma.ticket.create({ data: { number: nextNumber++, clientId: client.id, title: "Seeded", description: "Seeded", category: "GENERAL_REQUEST", ...extra } });
  const ids = async (who: User, query = ""): Promise<string[]> => (await as(who).get(`/api/v1/tickets${query}`)).body.data.map((x: { id: string }) => x.id);
  const status = (who: User, id: string, to: string, version: number, note?: string) => as(who).post(`/api/v1/tickets/${id}/status`).send({ status: to, version, ...(note === undefined ? {} : { note }) });
  const fresh = (id: string) => t.prisma.ticket.findUniqueOrThrow({ where: { id } });

  describe("opening a ticket", () => {
    it("lets a client open one: numbered from the ticket counter, Open, with an event, a notification to the team and an audit entry", async () => {
      const res = await open(client1, { priority: "HIGH" });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        number: 1001,
        displayNumber: "TKT-1001",
        title: "My filing is late",
        category: "FORMATION_DELAY",
        priority: "HIGH",
        status: "OPEN",
        statusLabel: "Open",
        version: 1,
        client: { id: client1.id, name: "Alex Client" },
        handler: null,
        case: null,
        resolution: null,
        messages: [],
        events: [{ from: null, to: "OPEN", note: "Ticket created", by: { id: client1.id } }],
      });
      expect(res.body.data).not.toHaveProperty("escalated");
      expect(res.body.message).toBe("TKT-1001 opened.");
      expect((await t.prisma.counter.findUniqueOrThrow({ where: { key: "ticket" } })).value).toBe(1001);
      for (const who of [admin, manager, compliance, csr1]) expect(await t.prisma.notification.count({ where: { userId: who.id, text: "New ticket TKT-1001 from Alex Client", link: "tickets" } })).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: { in: [csr2.id, client1.id, client2.id] } } })).toBe(0);
      expect(await t.prisma.auditLog.count({ where: { action: "Created ticket “My filing is late” (TKT-1001)", actorId: client1.id, category: "tickets" } })).toBe(1);
    });

    it("limits a client's priority to Normal or High, and defaults to Normal", async () => {
      expect((await open(client1)).body.data.priority).toBe("NORMAL");
      for (const priority of ["LOW", "URGENT"]) {
        const res = await open(client1, { priority });
        expect(res.status).toBe(422);
        expect(res.body.errors).toEqual([{ field: "priority", message: "Choose Normal or High." }]);
      }
      expect((await open(admin, { clientId: client1.id, priority: "URGENT" })).body.data.priority).toBe("URGENT");
    });

    it("lets staff open one on a client's behalf, and tells the client; a CSR only for their own clients", async () => {
      const res = await open(manager, { clientId: client2.id });
      expect(res.status).toBe(201);
      expect(res.body.data.client.id).toBe(client2.id);
      expect(await t.prisma.notification.count({ where: { userId: client2.id, text: "Max Manager opened ticket TKT-1001 for you: My filing is late", link: "home" } })).toBe(1);
      expect((await open(csr1, { clientId: client1.id })).status).toBe(201);
      const other = await open(csr1, { clientId: client2.id });
      expect(other.status).toBe(404);
      expect(other.body.errorCode).toBe("RESOURCE_NOT_FOUND");
      const none = await open(admin);
      expect(none.status).toBe(422);
      expect(none.body.errors).toEqual([{ field: "clientId", message: "Choose the client this ticket is for." }]);
    });

    it("won't let a client open a ticket for someone else", async () => {
      const res = await open(client1, { clientId: client2.id });
      expect(res.status).toBe(404);
      expect(await t.prisma.ticket.count()).toBe(0);
      expect((await open(client1, { clientId: client1.id })).status).toBe(201);
    });

    it("links a case only if it belongs to that client", async () => {
      const mine = await makeCase(t.prisma, { clientId: client1.id });
      const theirs = await makeCase(t.prisma, { clientId: client2.id });
      const ok = await open(client1, { caseId: mine.id });
      expect(ok.body.data.case).toEqual({ id: mine.id, displayNumber: `PRJ-${mine.number}` });
      const wrong = await open(client1, { caseId: theirs.id });
      expect(wrong.status).toBe(422);
      expect(wrong.body).toMatchObject({ errorCode: "CASE_CLIENT_MISMATCH", errors: [{ field: "caseId", message: "This case belongs to a different client." }] });
      expect((await open(client1, { caseId: "nope" })).status).toBe(404);
    });

    it("validates the subject, description, category and priority", async () => {
      const res = await as(client1).post("/api/v1/tickets").send({ title: "t".repeat(201), description: "d".repeat(5001), category: "GOSSIP", priority: "SOON", extra: 1 });
      expect(res.status).toBe(422);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          { field: "title", message: "The subject can't be longer than 200 characters." },
          { field: "description", message: "The description can't be longer than 5000 characters." },
          { field: "category", message: expect.stringContaining("category must be one of") },
          { field: "priority", message: expect.stringContaining("priority must be one of") },
          { field: "extra", message: "property extra should not exist" },
        ]),
      );
      expect((await open(client1, { title: "   " })).body.errors).toEqual([{ field: "title", message: "Enter a subject." }]);
      expect((await open(client1, { description: "" })).body.errors).toEqual([{ field: "description", message: "Describe the issue." }]);
      expect((await open(client1, { title: "t", description: "d" })).status).toBe(201);
      expect((await open(client1, { title: "t".repeat(200), description: "d".repeat(5000) })).status).toBe(201);
    });

    it("gives 20 tickets opened at the same time 20 distinct numbers", async () => {
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => open(i % 2 ? client1 : client2, { title: `Ticket ${i}` })));
      expect(results.map((r) => r.status)).toEqual(Array(20).fill(201));
      expect(results.map((r) => r.body.data.number as number).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => 1001 + i));
      expect((await t.prisma.counter.findUniqueOrThrow({ where: { key: "ticket" } })).value).toBe(1020);
    });

    it("refuses a removed client, and requires sign-in", async () => {
      await t.prisma.user.update({ where: { id: client2.id }, data: { status: "REMOVED", deletedAt: new Date() } });
      expect((await open(admin, { clientId: client2.id })).body.errorCode).toBe("USER_REMOVED");
      expect((await api(t).post("/api/v1/tickets").send({})).status).toBe(401);
    });
  });

  describe("who sees which ticket", () => {
    let a: Ticket;
    let b: Ticket;
    beforeEach(async () => {
      a = await seed(client1, { title: "Alex's problem" });
      b = await seed(client2, { title: "Bea's problem" });
    });

    it("shows a client only their own, and 404 for another client's on every route", async () => {
      expect(await ids(client1)).toEqual([a.id]);
      for (const res of [
        await as(client1).get(`/api/v1/tickets/${b.id}`),
        await as(client1).post(`/api/v1/tickets/${b.id}/messages`).send({ text: "hi" }),
        await as(client1).post(`/api/v1/tickets/${b.id}/status`).send({ status: "OPEN", version: 1 }),
        await as(client1).post(`/api/v1/tickets/${b.id}/close`).send({}),
      ]) {
        expect(res.status).toBe(404);
        expect(res.body.errorCode).toBe("RESOURCE_NOT_FOUND");
      }
    });

    it("shows a CSR only their own clients' tickets, and 404 for a colleague's", async () => {
      expect(await ids(csr1)).toEqual([a.id]);
      expect(await ids(csr2)).toEqual([b.id]);
      for (const res of [
        await as(csr1).get(`/api/v1/tickets/${b.id}`),
        await as(csr1).post(`/api/v1/tickets/${b.id}/messages`).send({ text: "hi" }),
        await as(csr1).post(`/api/v1/tickets/${b.id}/assign`).send({}),
        await as(csr1).post(`/api/v1/tickets/${b.id}/escalate`).send({}),
      ]) {
        expect(res.status).toBe(404);
      }
      expect(await ids(csr1, `?clientId=${client2.id}`)).toEqual([]);
    });

    it("shows Admin, Manager and Compliance every ticket", async () => {
      for (const who of [admin, manager, compliance]) expect((await ids(who)).sort()).toEqual([a.id, b.id].sort());
    });

    it("hides the tickets of a removed client from everyone but Admin and Manager", async () => {
      await t.prisma.user.update({ where: { id: client1.id }, data: { status: "REMOVED", deletedAt: new Date() } });
      expect(await ids(compliance)).toEqual([b.id]);
      expect(await ids(csr1)).toEqual([]);
      expect((await ids(manager)).sort()).toEqual([a.id, b.id].sort());
    });

    it("filters, searches, sorts and paginates", async () => {
      await t.prisma.ticket.update({ where: { id: b.id }, data: { priority: "HIGH", category: "COMPLAINT", status: "IN_PROGRESS", handlerId: manager.id, escalated: true } });
      expect(await ids(admin, "?status=IN_PROGRESS")).toEqual([b.id]);
      expect(await ids(admin, "?priority=HIGH")).toEqual([b.id]);
      expect(await ids(admin, "?category=COMPLAINT")).toEqual([b.id]);
      expect(await ids(admin, `?handlerId=${manager.id}`)).toEqual([b.id]);
      expect(await ids(admin, "?handlerId=none")).toEqual([a.id]);
      expect(await ids(admin, `?clientId=${client1.id}`)).toEqual([a.id]);
      expect(await ids(admin, "?escalated=true")).toEqual([b.id]);
      expect(await ids(admin, "?escalated=false")).toEqual([a.id]);
      expect(await ids(admin, "?search=bea")).toEqual([b.id]);
      expect(await ids(admin, "?search=alex%27s")).toEqual([a.id]);
      expect(await ids(admin, `?search=TKT-${a.number}`)).toEqual([a.id]);
      expect(await ids(admin)).toEqual([b.id, a.id]); // newest number first
      expect(await ids(admin, "?sort=number&order=asc")).toEqual([a.id, b.id]);
      const page = await as(admin).get("/api/v1/tickets?limit=1&page=2");
      expect(page.body.meta).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });
      const bad = await as(admin).get("/api/v1/tickets?page=0&limit=101&status=GONE&escalated=maybe");
      expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["escalated", "limit", "page", "status"]);
      expect((await as(admin).get("/api/v1/tickets?sort=description")).body.errors[0].field).toBe("sort");
    });

    it("doesn't let a client filter on the team's own fields", async () => {
      await t.prisma.ticket.update({ where: { id: a.id }, data: { escalated: true, handlerId: manager.id } });
      expect(await ids(client1, "?escalated=false")).toEqual([a.id]);
      expect(await ids(client1, "?handlerId=none")).toEqual([a.id]);
    });

    it("requires a signed-in user", async () => {
      expect((await api(t).get("/api/v1/tickets")).status).toBe(401);
      expect((await api(t).get(`/api/v1/tickets/${a.id}`)).status).toBe(401);
    });
  });

  describe("internal notes", () => {
    let id: string;
    const NOTE = "The client has been difficult about this; escalate quietly.";
    beforeEach(async () => {
      id = (await open(client1)).body.data.id;
      await t.prisma.notification.deleteMany();
      t.mail.sent = [];
      expect((await as(csr1).post(`/api/v1/tickets/${id}/messages`).send({ text: NOTE, internal: true })).status).toBe(201);
      expect((await as(csr1).post(`/api/v1/tickets/${id}/messages`).send({ text: "We are looking into it." })).status).toBe(201);
    });

    it("are never returned to the client", async () => {
      const detail = await as(client1).get(`/api/v1/tickets/${id}`);
      expect(detail.body.data.messages.map((m: { text: string }) => m.text)).toEqual(["We are looking into it."]);
      expect(detail.body.data.messages.every((m: { internal: boolean }) => m.internal === false)).toBe(true);
      expect(JSON.stringify(detail.body)).not.toContain("difficult");
      const everything = JSON.stringify([(await as(client1).get("/api/v1/tickets")).body, (await as(client1).post(`/api/v1/tickets/${id}/messages`).send({ text: "Thanks" })).body, (await as(client1).get(`/api/v1/tickets/${id}`)).body]);
      expect(everything).not.toContain("difficult");
      expect(JSON.stringify(await t.prisma.notification.findMany({ where: { userId: client1.id } }))).not.toContain("difficult");
    });

    it("are shown to every member of staff who can see the ticket, in order", async () => {
      for (const who of [csr1, admin, manager, compliance]) {
        const detail = await as(who).get(`/api/v1/tickets/${id}`);
        expect(detail.body.data.messages.map((m: { internal: boolean; text: string }) => [m.internal, m.text.slice(0, 7)])).toEqual([[true, "The cli"], [false, "We are "]]);
      }
    });

    it("can't be written by a client, and don't notify anyone", async () => {
      const res = await as(client1).post(`/api/v1/tickets/${id}/messages`).send({ text: "Secret note", internal: true });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Only staff can write internal notes. Your reply is visible to the team.");
      expect(await t.prisma.ticketMessage.count({ where: { text: "Secret note" } })).toBe(0);
      await t.prisma.notification.deleteMany();
      await as(admin).post(`/api/v1/tickets/${id}/messages`).send({ text: "Another internal note", internal: true });
      expect(await t.prisma.notification.count()).toBe(0);
      expect(await t.prisma.auditLog.count({ where: { action: { startsWith: "Internal note on TKT-" } } })).toBe(2);
    });

    it("leave the thread's replies visible, and a reply notifies the client", async () => {
      await t.prisma.notification.deleteMany();
      t.mail.sent = [];
      await as(manager).post(`/api/v1/tickets/${id}/messages`).send({ text: "An update for you" });
      expect(await t.prisma.notification.findMany({ where: { userId: client1.id }, select: { text: true, link: true } })).toEqual([{ text: "Reply on TKT-1001 from Max Manager", link: "home" }]);
      expect(t.mail.sent.filter((m) => m.kind === "notification").map((m) => m.to)).toEqual(["client1@test.dev"]);
    });
  });

  describe("history", () => {
    it("leaves out events where the status didn't change (escalations, assignments) for a client, and keeps them for staff", async () => {
      const id = (await open(client1)).body.data.id as string;
      await as(csr1).post(`/api/v1/tickets/${id}/assign`).send({});
      await as(csr1).post(`/api/v1/tickets/${id}/escalate`).send({});
      await status(csr1, id, "IN_PROGRESS", (await fresh(id)).version, "Working on it");
      const client = (await as(client1).get(`/api/v1/tickets/${id}`)).body.data;
      expect(client.events.map((e: { from: string | null; to: string }) => [e.from, e.to])).toEqual([[null, "OPEN"], ["OPEN", "IN_PROGRESS"]]);
      expect(JSON.stringify(client)).not.toContain("Escalated to Admin and Manager");
      expect(JSON.stringify(client)).not.toContain("Took over");
      const staff = (await as(csr1).get(`/api/v1/tickets/${id}`)).body.data;
      expect(staff.events.map((e: { note: string }) => e.note)).toEqual(["Ticket created", "Took over the ticket", "Escalated to Admin and Manager", "Working on it"]);
      expect(staff.events[3].by).toMatchObject({ id: csr1.id, name: "Cora CSR", role: "CSR" });
    });
  });

  describe("the status machine", () => {
    const pairs = ALL.flatMap((from) => ALL.map((to) => [from, to] as const));

    it.each(pairs)("staff moving a ticket from %s to %s", async (from, to) => {
      const ticket = await seed(client1, { status: from, ...(from === "RESOLVED" ? { resolvedAt: new Date(), resolutionNote: "Fixed" } : {}) });
      const res = await status(admin, ticket.id, to, ticket.version, to === "RESOLVED" ? "Fixed it by resubmitting" : "Because");
      if (allowed(from, to)) {
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ status: to, statusLabel: LABEL[to], version: 2 });
        expect(res.body.message).toBe(`TKT-${ticket.number} is now ${LABEL[to]}.`);
      } else {
        expect(res.status).toBe(409);
        expect(res.body.errorCode).toBe("INVALID_STATE_TRANSITION");
        expect(res.body.message).toContain(`A ticket can't move from "${LABEL[from]}" to "${LABEL[to]}".`);
        expect((await fresh(ticket.id)).status).toBe(from);
        expect((await fresh(ticket.id)).version).toBe(1);
      }
    });

    it("explains a refused move in words", async () => {
      const closed = await seed(client1, { status: "CLOSED" });
      expect((await status(admin, closed.id, "OPEN", 1)).body.message).toContain("A closed ticket is final.");
      const resolved = await seed(client1, { status: "RESOLVED", resolvedAt: new Date() });
      expect((await status(admin, resolved.id, "IN_PROGRESS", 1)).body.message).toContain("A resolved ticket can only be reopened");
      const active = await seed(client1);
      expect((await status(admin, active.id, "OPEN", 1)).body.message).toContain("It is already in that status.");
    });

    it("needs resolution notes to resolve, with its own error code", async () => {
      const ticket = await seed(client1);
      for (const note of [undefined, "", "   "]) {
        const res = await status(admin, ticket.id, "RESOLVED", 1, note);
        expect(res.status).toBe(422);
        expect(res.body).toMatchObject({
          errorCode: "TICKET_RESOLUTION_REQUIRED",
          message: "Say what fixed the problem before resolving the ticket. The client sees it.",
          errors: [{ field: "note", message: "Add the resolution notes." }],
        });
      }
      expect((await fresh(ticket.id)).status).toBe("OPEN");
      const ok = await status(admin, ticket.id, "RESOLVED", 1, "Resubmitted the paperwork");
      expect(ok.body.data.resolution).toMatchObject({ note: "Resubmitted the paperwork", by: { id: admin.id, name: "Ada Admin" } });
      expect(ok.body.data.resolution.at).not.toBeNull();
    });

    it("sets the handler to whoever first changes the status, and keeps an existing handler", async () => {
      const ticket = await seed(client1);
      await status(csr1, ticket.id, "IN_PROGRESS", 1);
      expect((await fresh(ticket.id)).handlerId).toBe(csr1.id);
      await status(admin, ticket.id, "WAITING_FOR_CLIENT", 2, "Need the EIN letter");
      expect((await fresh(ticket.id)).handlerId).toBe(csr1.id);
    });

    it("records who changed it, the roles, and the notification wording", async () => {
      const ticket = await seed(client1, { handlerId: manager.id });
      await status(compliance, ticket.id, "WAITING_FOR_INTERNAL_TEAM", 1, "Waiting for Legal");
      const events = await t.prisma.ticketEvent.findMany({ where: { ticketId: ticket.id } });
      expect(events).toMatchObject([{ fromStatus: "OPEN", toStatus: "WAITING_FOR_INTERNAL_TEAM", byId: compliance.id, note: "Waiting for Legal" }]);
      expect(await t.prisma.notification.findMany({ where: { userId: client1.id }, select: { text: true, link: true } })).toEqual([{ text: `TKT-${ticket.number} is now Waiting for Internal Team`, link: "home" }]);
      expect(await t.prisma.notification.count({ where: { userId: manager.id, text: `TKT-${ticket.number} is now Waiting for Internal Team`, link: "tickets" } })).toBe(1);
      expect(await t.prisma.auditLog.count({ where: { action: `Changed status of TKT-${ticket.number} to Waiting for Internal Team`, actorId: compliance.id } })).toBe(1);
    });

    it("validates the status and requires the version", async () => {
      const ticket = await seed(client1);
      const res = await as(admin).post(`/api/v1/tickets/${ticket.id}/status`).send({ status: "DONE", note: "n".repeat(1001) });
      expect(res.status).toBe(422);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          { field: "status", message: expect.stringContaining("status must be one of") },
          { field: "note", message: "The note can't be longer than 1000 characters." },
          { field: "version", message: expect.stringContaining("Send the version you loaded") },
        ]),
      );
    });

    it("lets a CSR change only their own clients' tickets", async () => {
      const mine = await seed(client1);
      const theirs = await seed(client2);
      expect((await status(csr1, mine.id, "IN_PROGRESS", 1)).status).toBe(200);
      expect((await status(csr1, theirs.id, "IN_PROGRESS", 1)).status).toBe(404);
    });
  });

  describe("the active / finished group filter", () => {
    it("splits tickets into those still being worked and those resolved or closed", async () => {
      const a = await seed(client1, { status: "IN_PROGRESS" });
      const b = await seed(client1, { status: "RESOLVED", resolvedAt: new Date(), resolutionNote: "x" });
      const c = await seed(client1, { status: "CLOSED" });
      const ids = async (q: string) => ((await as(csr1).get(`/api/v1/tickets?${q}`)).body.data as Array<{ id: string }>).map((t) => t.id).sort();
      expect(await ids("group=active")).toEqual([a.id]);
      expect(await ids("group=finished")).toEqual([b.id, c.id].sort());
      expect((await as(csr1).get("/api/v1/tickets?group=nope")).body.errors[0].field).toBe("group");
    });
  });

  describe("addressing a ticket by its number", () => {
    it("opens TKT-n like the id, with the same scoping", async () => {
      const mine = await seed(client1);
      const theirs = await seed(client2);
      const res = await as(csr1).get(`/api/v1/tickets/TKT-${mine.number}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(mine.id);
      expect((await as(csr1).get(`/api/v1/tickets/tkt-${theirs.number}`)).status).toBe(404);
      expect((await as(client1).get(`/api/v1/tickets/TKT-${theirs.number}`)).status).toBe(404);
    });
  });

  describe("allowedStatuses (the buttons a screen may offer)", () => {
    it("gives staff the workflow's next steps for every status", async () => {
      for (const from of ALL) {
        const ticket = await seed(client1, { status: from, ...(from === "RESOLVED" ? { resolvedAt: new Date(), resolutionNote: "x" } : {}) });
        const got = (await as(csr1).get(`/api/v1/tickets/${ticket.id}`)).body.data.allowedStatuses as TicketStatus[];
        expect([...got].sort()).toEqual(ALL.filter((to) => allowed(from, to)).sort());
      }
    });

    it("gives a client only Closed and Open while resolved, Open only inside the window, and nothing otherwise", async () => {
      const open = await seed(client1, { status: "IN_PROGRESS" });
      expect((await as(client1).get(`/api/v1/tickets/${open.id}`)).body.data.allowedStatuses).toEqual([]);
      const fresh = await seed(client1, { status: "RESOLVED", resolvedAt: new Date(), resolutionNote: "x" });
      expect((await as(client1).get(`/api/v1/tickets/${fresh.id}`)).body.data.allowedStatuses.sort()).toEqual(["CLOSED", "OPEN"]);
      const old = await seed(client1, { status: "RESOLVED", resolvedAt: new Date(Date.now() - 8 * 86_400_000), resolutionNote: "x" });
      expect((await as(client1).get("/api/v1/tickets")).body.data.find((x: { id: string }) => x.id === old.id).allowedStatuses).toEqual(["CLOSED"]);
    });
  });

  describe("what a client may do to a resolved ticket", () => {
    it("lets a client reopen a resolved ticket inside the window", async () => {
      const ticket = await seed(client1, { status: "RESOLVED", resolvedAt: new Date(Date.now() - 6 * 86_400_000), resolutionNote: "Fixed", handlerId: csr1.id });
      const res = await status(client1, ticket.id, "OPEN", 1);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: "OPEN", version: 2 });
      // The earlier resolution stays on record, and the team is told.
      expect(res.body.data.resolution.note).toBe("Fixed");
      expect((await t.prisma.ticketEvent.findFirstOrThrow({ where: { ticketId: ticket.id } })).note).toBe("Client requested reopening");
      expect(await t.prisma.notification.count({ where: { userId: csr1.id, text: "Alex Client updated TKT-" + ticket.number } })).toBe(1);
      expect(await t.prisma.auditLog.count({ where: { action: `Requested reopening of TKT-${ticket.number}`, actorId: client1.id } })).toBe(1);
    });

    it("refuses a reopen after the window, with a message that names it, and still lets staff reopen", async () => {
      const ticket = await seed(client1, { status: "RESOLVED", resolvedAt: new Date(Date.now() - 8 * 86_400_000), resolutionNote: "Fixed" });
      const res = await status(client1, ticket.id, "OPEN", 1);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ errorCode: "TICKET_REOPEN_WINDOW_PASSED" });
      expect(res.body.message).toBe(`TKT-${ticket.number} was resolved more than 7 days ago, so it can no longer be reopened from here. Open a new ticket, or ask the team to reopen it.`);
      expect((await fresh(ticket.id)).status).toBe("RESOLVED");
      expect((await status(csr1, ticket.id, "OPEN", 1)).status).toBe(200);
    });

    it("uses the window from the environment, and 0 switches client reopening off", async () => {
      const short = await createAppWithMail({ TICKET_REOPEN_DAYS: "0" });
      try {
        await resetDatabase(short.prisma);
        const owner = await makeUser(short.prisma, { email: "o@test.dev", name: "Olly", role: "CLIENT" });
        const ticket = await short.prisma.ticket.create({ data: { number: 5001, clientId: owner.id, title: "x", description: "y", category: "COMPLAINT", status: "RESOLVED", resolvedAt: new Date() } });
        const res = await api(short, bearerFor(short, owner)).post(`/api/v1/tickets/${ticket.id}/status`).send({ status: "OPEN", version: 1 });
        expect(res.body.message).toBe("TKT-5001 can't be reopened by the client. Open a new ticket, or ask the team to reopen it.");
      } finally {
        await short.close();
      }
    });

    it("lets a client confirm a resolved ticket (close it), and never close an active one", async () => {
      const resolved = await seed(client1, { status: "RESOLVED", resolvedAt: new Date() });
      const res = await as(client1).post(`/api/v1/tickets/${resolved.id}/close`).send({});
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("CLOSED");
      expect((await t.prisma.ticketEvent.findFirstOrThrow({ where: { ticketId: resolved.id } })).note).toBe("Client confirmed the issue is resolved");
      const active = await seed(client1, { status: "IN_PROGRESS" });
      const refused = await as(client1).post(`/api/v1/tickets/${active.id}/close`).send({});
      expect(refused.status).toBe(409);
      expect(refused.body.errorCode).toBe("INVALID_STATE_TRANSITION");
      expect(refused.body.message).toContain("You can reopen or confirm a ticket once it has been resolved.");
      expect((await fresh(active.id)).status).toBe("IN_PROGRESS");
    });

    it("only lets staff set Waiting for Client, Waiting for Internal Team, In Progress or Resolved", async () => {
      const ticket = await seed(client1, { status: "RESOLVED", resolvedAt: new Date() });
      for (const to of ["IN_PROGRESS", "WAITING_FOR_CLIENT", "WAITING_FOR_INTERNAL_TEAM", "RESOLVED"] as const) {
        const res = await status(client1, ticket.id, to, 1, "please");
        expect(res.status).toBe(403);
        expect(res.body.errorCode).toBe("TICKET_STATUS_STAFF_ONLY");
        expect(res.body.message).toBe(`Only staff can set a ticket to "${LABEL[to]}". Reply to the ticket and the team will update it.`);
      }
      expect((await fresh(ticket.id)).status).toBe("RESOLVED");
      const waiting = await seed(client1, { status: "WAITING_FOR_CLIENT" });
      expect((await status(client1, waiting.id, "OPEN", 1)).body.errorCode).toBe("INVALID_STATE_TRANSITION");
    });

    it("refuses a client escalation, assignment and resolution", async () => {
      const ticket = await seed(client1);
      for (const res of [
        await as(client1).post(`/api/v1/tickets/${ticket.id}/escalate`).send({}),
        await as(client1).post(`/api/v1/tickets/${ticket.id}/assign`).send({}),
        await as(client1).post(`/api/v1/tickets/${ticket.id}/resolve`).send({ resolutionNote: "I fixed it" }),
      ]) {
        expect(res.status).toBe(403);
      }
    });
  });

  describe("closed tickets", () => {
    it("accept no replies, from anyone, with a message saying so", async () => {
      const closed = await seed(client1, { status: "CLOSED" });
      for (const who of [client1, csr1, admin]) {
        const res = await as(who).post(`/api/v1/tickets/${closed.id}/messages`).send({ text: "One more thing" });
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ errorCode: "TICKET_CLOSED", message: `TKT-${closed.number} is closed, so it accepts no more replies. Open a new ticket if the problem is back.` });
      }
      expect(await t.prisma.ticketMessage.count()).toBe(0);
    });

    it("still accept replies while Resolved, and refuse assignment once Closed", async () => {
      const resolved = await seed(client1, { status: "RESOLVED", resolvedAt: new Date() });
      expect((await as(client1).post(`/api/v1/tickets/${resolved.id}/messages`).send({ text: "Thank you!" })).status).toBe(201);
      const closed = await seed(client1, { status: "CLOSED" });
      const res = await as(admin).post(`/api/v1/tickets/${closed.id}/assign`).send({});
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(`TKT-${closed.number} is closed, so it can't be changed. Open a new ticket if the problem is back.`);
    });

    it("validates the reply", async () => {
      const ticket = await seed(client1);
      expect((await as(client1).post(`/api/v1/tickets/${ticket.id}/messages`).send({ text: "   " })).body.errors).toEqual([{ field: "text", message: "Write a reply first." }]);
      expect((await as(client1).post(`/api/v1/tickets/${ticket.id}/messages`).send({ text: "t".repeat(5001) })).body.errors[0].message).toBe("A reply can't be longer than 5000 characters.");
      expect((await as(client1).post(`/api/v1/tickets/${ticket.id}/messages`).send({ text: "t".repeat(5000) })).status).toBe(201);
    });
  });

  describe("optimistic locking", () => {
    it("refuses a stale version with CONCURRENT_MODIFICATION and changes nothing", async () => {
      const ticket = await seed(client1);
      expect((await status(admin, ticket.id, "IN_PROGRESS", 1)).status).toBe(200);
      const stale = await status(manager, ticket.id, "WAITING_FOR_CLIENT", 1, "late");
      expect(stale.status).toBe(409);
      expect(stale.body.errorCode).toBe("CONCURRENT_MODIFICATION");
      expect(stale.body.message).toContain("Someone else changed this ticket");
      expect((await fresh(ticket.id)).status).toBe("IN_PROGRESS");
      expect((await status(manager, ticket.id, "WAITING_FOR_CLIENT", 2)).status).toBe(200);
    });

    it("lets the database decide when two requests have both read the same version", async () => {
      const ticket = await seed(client1);
      const repo = t.app.get(TicketsRepository);
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
        const [a, b] = await Promise.all([status(admin, ticket.id, "IN_PROGRESS", 1, "from Ada"), status(manager, ticket.id, "WAITING_FOR_CLIENT", 1, "from Max")]);
        expect(arrived).toBe(2);
        expect([a.status, b.status].sort()).toEqual([200, 409]);
        expect((a.status === 409 ? a : b).body.errorCode).toBe("CONCURRENT_MODIFICATION");
      } finally {
        spy.mockRestore();
      }
      expect((await fresh(ticket.id)).version).toBe(2);
      expect(await t.prisma.ticketEvent.count({ where: { ticketId: ticket.id } })).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: client1.id } })).toBe(1);
    });

    it("counts escalations and assignments as changes, and checks an optional version on them", async () => {
      const ticket = await seed(client1);
      await as(admin).post(`/api/v1/tickets/${ticket.id}/escalate`).send({});
      expect((await fresh(ticket.id)).version).toBe(2);
      expect((await status(admin, ticket.id, "IN_PROGRESS", 1)).body.errorCode).toBe("CONCURRENT_MODIFICATION");
      expect((await as(admin).post(`/api/v1/tickets/${ticket.id}/assign`).send({ version: 1 })).body.errorCode).toBe("CONCURRENT_MODIFICATION");
      expect((await as(admin).post(`/api/v1/tickets/${ticket.id}/assign`).send({ version: 2 })).status).toBe(200);
    });
  });

  describe("escalating", () => {
    it("escalates an active ticket, tells Admin and Manager, and hides it from the client", async () => {
      const ticket = await seed(client1, { status: "IN_PROGRESS" });
      const res = await as(csr1).post(`/api/v1/tickets/${ticket.id}/escalate`).send({});
      expect(res.status).toBe(200);
      expect(res.body.data.escalated).toBe(true);
      expect(res.body.message).toBe(`TKT-${ticket.number} escalated. Admin and Manager were notified.`);
      for (const who of [admin, manager]) expect(await t.prisma.notification.count({ where: { userId: who.id, text: `TKT-${ticket.number} was escalated by Cora CSR` } })).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: { in: [csr1.id, compliance.id, client1.id] } } })).toBe(0);
      expect((await as(client1).get(`/api/v1/tickets/${ticket.id}`)).body.data).not.toHaveProperty("escalated");
      expect((await t.prisma.ticketEvent.findFirstOrThrow({ where: { ticketId: ticket.id } }))).toMatchObject({ fromStatus: "IN_PROGRESS", toStatus: "IN_PROGRESS", note: "Escalated to Admin and Manager" });
    });

    it("refuses to escalate a Resolved or Closed ticket, with a specific message", async () => {
      for (const [state, word] of [["RESOLVED", "resolved"], ["CLOSED", "closed"]] as const) {
        const ticket = await seed(client1, { status: state, resolvedAt: new Date() });
        const res = await as(admin).post(`/api/v1/tickets/${ticket.id}/escalate`).send({});
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ errorCode: "TICKET_ESCALATION_NOT_ALLOWED", message: `TKT-${ticket.number} is ${word}, so it can't be escalated. Reopen it first if it needs more attention.` });
        expect((await fresh(ticket.id)).escalated).toBe(false);
      }
    });

    it("removes an escalation with escalated: false (even on a resolved ticket), and repeating either is harmless", async () => {
      const ticket = await seed(client1);
      await as(admin).post(`/api/v1/tickets/${ticket.id}/escalate`).send({});
      const again = await as(admin).post(`/api/v1/tickets/${ticket.id}/escalate`).send({});
      expect(again.status).toBe(200);
      expect((await fresh(ticket.id)).version).toBe(2);
      await t.prisma.ticket.update({ where: { id: ticket.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
      const off = await as(admin).post(`/api/v1/tickets/${ticket.id}/escalate`).send({ escalated: false });
      expect(off.body.data.escalated).toBe(false);
      expect(off.body.message).toBe("Escalation removed.");
      expect((await as(admin).post(`/api/v1/tickets/${ticket.id}/escalate`).send({ escalated: false })).status).toBe(200);
      expect(await t.prisma.ticketEvent.count({ where: { ticketId: ticket.id } })).toBe(2);
    });
  });

  describe("assigning", () => {
    it("lets staff take a ticket, and Admin and Manager hand it to someone else", async () => {
      const ticket = await seed(client1);
      const own = await as(csr1).post(`/api/v1/tickets/${ticket.id}/assign`).send({});
      expect(own.body.data.handler).toEqual({ id: csr1.id, name: "Cora CSR" });
      const handed = await as(manager).post(`/api/v1/tickets/${ticket.id}/assign`).send({ handlerId: compliance.id });
      expect(handed.body.data.handler.id).toBe(compliance.id);
      expect(await t.prisma.notification.count({ where: { userId: compliance.id, text: `TKT-${ticket.number} was assigned to you`, link: "tickets" } })).toBe(1);
      expect(await t.prisma.auditLog.count({ where: { action: `Took over TKT-${ticket.number}` } })).toBe(1);
      expect(await t.prisma.auditLog.count({ where: { action: `Assigned TKT-${ticket.number} to Cleo Compliance` } })).toBe(1);
    });

    it("refuses a CSR who tries to hand it to someone else, and an assignee who isn't active staff", async () => {
      const ticket = await seed(client1);
      const res = await as(csr1).post(`/api/v1/tickets/${ticket.id}/assign`).send({ handlerId: manager.id });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Only Admin and Manager can hand a ticket to someone else. You can take it yourself.");
      const suspended = await makeUser(t.prisma, { email: "sus@test.dev", name: "Sam", role: "CSR", status: "SUSPENDED" });
      for (const handlerId of [client1.id, suspended.id, "nobody"]) {
        const bad = await as(admin).post(`/api/v1/tickets/${ticket.id}/assign`).send({ handlerId });
        expect(bad.status).toBe(422);
        expect(bad.body).toMatchObject({ errorCode: "INVALID_TICKET_HANDLER", errors: [{ field: "handlerId", message: "Choose an active staff member." }] });
      }
      expect((await fresh(ticket.id)).handlerId).toBeNull();
    });

    it("does nothing when the ticket is already with that person", async () => {
      const ticket = await seed(client1, { handlerId: csr1.id });
      expect((await as(csr1).post(`/api/v1/tickets/${ticket.id}/assign`).send({})).status).toBe(200);
      expect((await fresh(ticket.id)).version).toBe(1);
      expect(await t.prisma.ticketEvent.count()).toBe(0);
    });
  });

  describe("resolving and closing", () => {
    it("resolves with resolution notes the client can read, and tells the client", async () => {
      const ticket = await seed(client1);
      const none = await as(csr1).post(`/api/v1/tickets/${ticket.id}/resolve`).send({});
      expect(none.status).toBe(422);
      expect(none.body.errorCode).toBe("TICKET_RESOLUTION_REQUIRED");
      const res = await as(csr1).post(`/api/v1/tickets/${ticket.id}/resolve`).send({ resolutionNote: "  Resubmitted the form  " });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe(`TKT-${ticket.number} resolved. The client was notified.`);
      expect(res.body.data).toMatchObject({ status: "RESOLVED", resolution: { note: "Resubmitted the form", by: { id: csr1.id } } });
      const asClient = await as(client1).get(`/api/v1/tickets/${ticket.id}`);
      expect(asClient.body.data.resolution.note).toBe("Resubmitted the form");
      expect(await t.prisma.notification.count({ where: { userId: client1.id, text: `TKT-${ticket.number} is now Resolved` } })).toBe(1);
      expect(await t.prisma.auditLog.count({ where: { action: `Resolved TKT-${ticket.number}` } })).toBe(1);
      expect((await as(csr1).post(`/api/v1/tickets/${ticket.id}/resolve`).send({ resolutionNote: "again" })).body.errorCode).toBe("INVALID_STATE_TRANSITION");
    });

    it("lets staff close a ticket, and closes a resolved one in one step", async () => {
      const active = await seed(client1);
      expect((await as(csr1).post(`/api/v1/tickets/${active.id}/close`).send({ note: "Duplicate of another ticket" })).body.data.status).toBe("CLOSED");
      const resolved = await seed(client1, { status: "RESOLVED", resolvedAt: new Date() });
      expect((await as(admin).post(`/api/v1/tickets/${resolved.id}/close`).send({})).body.data.status).toBe("CLOSED");
      expect((await as(admin).post(`/api/v1/tickets/${resolved.id}/close`).send({})).body.errorCode).toBe("INVALID_STATE_TRANSITION");
    });
  });

  describe("notifications follow preferences", () => {
    it("skips the in-app notification and the email a person switched off", async () => {
      await t.prisma.notificationPreference.create({ data: { userId: client1.id, category: "TICKETS", inApp: false, email: true } });
      await t.prisma.notificationPreference.create({ data: { userId: csr1.id, category: "TICKETS", inApp: true, email: false } });
      const created = await open(client1);
      expect(created.status).toBe(201);
      expect(await t.prisma.notification.count({ where: { userId: csr1.id } })).toBe(1);
      expect(t.mail.sent.filter((m) => m.kind === "notification").map((m) => m.to)).not.toContain("csr1@test.dev");
      await t.prisma.notification.deleteMany();
      t.mail.sent = [];
      await status(admin, created.body.data.id, "IN_PROGRESS", 1);
      expect(await t.prisma.notification.count({ where: { userId: client1.id } })).toBe(0);
      expect(t.mail.sent.filter((m) => m.kind === "notification").map((m) => m.to)).toEqual(["client1@test.dev"]);
    });

    it("still changes the status when the email can't be sent after the commit", async () => {
      const ticket = await seed(client1);
      t.mail.failWith = new Error("SMTP is down");
      expect((await status(admin, ticket.id, "IN_PROGRESS", 1)).status).toBe(200);
      expect((await fresh(ticket.id)).status).toBe("IN_PROGRESS");
    });
  });
});
