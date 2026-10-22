import { api, bearerFor, createAppWithMail, dayOffset, makeCase, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

type User = Awaited<ReturnType<typeof makeUser>>;

describe("follow-ups and interactions (e2e)", () => {
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
  let orphan: User; // no CSR

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    admin = await makeUser(t.prisma, { email: "admin@test.dev", name: "Ada Admin", role: "ADMIN" });
    manager = await makeUser(t.prisma, { email: "manager@test.dev", name: "Max Manager", role: "MANAGER" });
    csr1 = await makeUser(t.prisma, { email: "csr1@test.dev", name: "Cora CSR", role: "CSR" });
    csr2 = await makeUser(t.prisma, { email: "csr2@test.dev", name: "Carl CSR", role: "CSR" });
    compliance = await makeUser(t.prisma, { email: "comp@test.dev", name: "Cleo Compliance", role: "COMPLIANCE" });
    client1 = await makeUser(t.prisma, { email: "client1@test.dev", name: "Alex Client", role: "CLIENT", csrId: csr1.id });
    client2 = await makeUser(t.prisma, { email: "client2@test.dev", name: "Bea Client", role: "CLIENT", csrId: csr2.id });
    orphan = await makeUser(t.prisma, { email: "orphan@test.dev", name: "Olly Orphan", role: "CLIENT" });
    await makeCase(t.prisma, { clientId: client1.id });
  });

  const as = (user: { id: string; role: Parameters<typeof bearerFor>[1]["role"] }) => api(t, bearerFor(t, user));
  const mk = (who: User, clientId: string, extra: Record<string, unknown> = {}) =>
    as(who).post("/api/v1/followups").send({ clientId, type: "CALL", due: dayOffset(2), note: "Check in about the EIN", ...extra });
  const ids = async (who: User, query = ""): Promise<string[]> => (await as(who).get(`/api/v1/followups${query}`)).body.data.map((x: { id: string }) => x.id);
  /** A follow-up straight in the database, so tests can have one that is already overdue. */
  const seed = (csr: User, client: User, due: string, extra: Record<string, unknown> = {}) =>
    t.prisma.followUp.create({ data: { clientId: client.id, csrId: csr.id, type: "CALL", due: new Date(`${due}T00:00:00Z`), note: "Seeded", ...extra } });

  describe("follow-ups: who sees what", () => {
    it("shows a CSR only their own follow-ups, and 404 for a colleague's on every route", async () => {
      const mine = await seed(csr1, client1, dayOffset(1));
      const theirs = await seed(csr2, client2, dayOffset(1));
      expect(await ids(csr1)).toEqual([mine.id]);
      expect(await ids(csr2)).toEqual([theirs.id]);
      // A filter can't widen it.
      expect(await ids(csr1, `?csrId=${csr2.id}`)).toEqual([]);
      expect(await ids(csr1, `?clientId=${client2.id}`)).toEqual([]);

      for (const res of [
        await as(csr1).patch(`/api/v1/followups/${theirs.id}`).send({ note: "Hijack" }),
        await as(csr1).post(`/api/v1/followups/${theirs.id}/done`).send({ outcome: "Done for them" }),
        await as(csr1).delete(`/api/v1/followups/${theirs.id}`),
      ]) {
        expect(res.status).toBe(404);
        expect(res.body.errorCode).toBe("RESOURCE_NOT_FOUND");
      }
      expect(await t.prisma.followUp.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ note: "Seeded", status: "OPEN" });
    });

    it("shows Admin and Manager every follow-up, filtered by CSR, client and status", async () => {
      const a = await seed(csr1, client1, dayOffset(1));
      const b = await seed(csr2, client2, dayOffset(2), { status: "DONE", outcome: "Spoke", doneAt: new Date() });
      for (const who of [admin, manager]) expect((await ids(who)).sort()).toEqual([a.id, b.id].sort());
      expect(await ids(admin, `?csrId=${csr2.id}`)).toEqual([b.id]);
      expect(await ids(admin, `?clientId=${client1.id}`)).toEqual([a.id]);
      expect(await ids(admin, "?status=DONE")).toEqual([b.id]);
      expect(await ids(admin, "?status=OPEN")).toEqual([a.id]);
    });

    it("keeps follow-ups from Compliance and clients, with the rule's message", async () => {
      for (const who of [compliance, client1]) {
        const res = await as(who).get("/api/v1/followups");
        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Follow-ups are limited to the client's CSR, Manager and Admin.");
        expect((await mk(who, client1.id)).status).toBe(403);
      }
      expect((await api(t).get("/api/v1/followups")).status).toBe(401);
    });

    it("filters overdue, today and upcoming, open ones only, from the server's date", async () => {
      const overdue = await seed(csr1, client1, dayOffset(-2));
      const today = await seed(csr1, client1, dayOffset(0));
      const upcoming = await seed(csr1, client1, dayOffset(4));
      const doneOld = await seed(csr1, client1, dayOffset(-9), { status: "DONE", outcome: "x", doneAt: new Date() });
      expect(await ids(csr1, "?filter=overdue")).toEqual([overdue.id]);
      expect(await ids(csr1, "?filter=today")).toEqual([today.id]);
      expect(await ids(csr1, "?filter=upcoming")).toEqual([upcoming.id]);
      expect(await ids(csr1)).toEqual([doneOld.id, overdue.id, today.id, upcoming.id]); // by due date
      const rows = (await as(csr1).get("/api/v1/followups")).body.data as Array<{ id: string; overdue: boolean }>;
      expect(Object.fromEntries(rows.map((r) => [r.id, r.overdue]))).toEqual({ [doneOld.id]: false, [overdue.id]: true, [today.id]: false, [upcoming.id]: false });
      const bad = await as(csr1).get("/api/v1/followups?filter=soon&status=LATER&page=0&limit=500");
      expect(bad.status).toBe(422);
      expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["filter", "limit", "page", "status"]);
    });
  });

  describe("follow-ups: create", () => {
    it("lets a CSR add one for their own client, and writes the audit entry", async () => {
      const res = await mk(csr1, client1.id, { type: "EMAIL", due: dayOffset(0) });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ type: "EMAIL", status: "OPEN", due: dayOffset(0), note: "Check in about the EIN", overdue: false, client: { id: client1.id, name: "Alex Client" }, csr: { id: csr1.id } });
      expect(await t.prisma.auditLog.count({ where: { action: "Added follow-up for Alex Client", actorId: csr1.id } })).toBe(1);
    });

    it("refuses a CSR a client who isn't theirs: a 404, like a client that doesn't exist", async () => {
      const other = await mk(csr1, client2.id);
      expect(other.status).toBe(404);
      expect(other.body.errorCode).toBe("RESOURCE_NOT_FOUND");
      expect((await mk(csr1, "nobody")).status).toBe(404);
      expect((await mk(csr1, orphan.id)).status).toBe(404);
      expect(await t.prisma.followUp.count()).toBe(0);
    });

    it("lets Admin and Manager choose any client, and puts it on that client's CSR's list", async () => {
      const res = await mk(manager, client2.id);
      expect(res.status).toBe(201);
      expect(res.body.data.csr).toEqual({ id: csr2.id, name: "Carl CSR" });
      expect(await ids(csr2)).toEqual([res.body.data.id]);
      // A client with no CSR: the person who created it holds it.
      const unassigned = await mk(admin, orphan.id);
      expect(unassigned.body.data.csr.id).toBe(admin.id);
    });

    it("does not accept a due date before today, but accepts today", async () => {
      const past = await mk(csr1, client1.id, { due: dayOffset(-1) });
      expect(past.status).toBe(422);
      expect(past.body).toMatchObject({ errorCode: "FOLLOWUP_DATE_IN_PAST", message: "A follow-up can't be due before today. Choose today or a later date.", errors: [{ field: "due", message: "Choose today or a later date." }] });
      expect((await mk(csr1, client1.id, { due: dayOffset(0) })).status).toBe(201);
      const bad = await mk(csr1, client1.id, { due: "05/11/2030" });
      expect(bad.body.errorCode).toBe("VALIDATION_FAILED");
      expect(await t.prisma.followUp.count()).toBe(1);
    });

    it("validates the type, the note and unknown fields", async () => {
      const res = await as(csr1).post("/api/v1/followups").send({ type: "SMOKE_SIGNAL", note: "n".repeat(501), extra: true });
      expect(res.status).toBe(422);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          { field: "clientId", message: "Choose a client." },
          { field: "type", message: "type must be one of: CALL, EMAIL, PORTAL_MESSAGE, MEETING." },
          { field: "note", message: "The note can't be longer than 500 characters." },
          { field: "due", message: "Choose a due date (YYYY-MM-DD)." },
          { field: "extra", message: "property extra should not exist" },
        ]),
      );
      expect((await mk(csr1, client1.id, { note: "   " })).body.errors[0]).toEqual({ field: "note", message: "Add what the follow-up is about." });
      for (const type of ["CALL", "EMAIL", "PORTAL_MESSAGE", "MEETING"]) expect((await mk(csr1, client1.id, { type })).status).toBe(201);
    });

    it("refuses a removed client", async () => {
      await t.prisma.user.update({ where: { id: client1.id }, data: { status: "REMOVED", deletedAt: new Date() } });
      const res = await mk(admin, client1.id);
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe("USER_REMOVED");
    });
  });

  describe("follow-ups: done writes an interaction", () => {
    it("requires an outcome, with its own error code, whether it is missing or blank", async () => {
      const f = await seed(csr1, client1, dayOffset(1), { type: "MEETING" });
      for (const payload of [{}, { outcome: "" }, { outcome: "   " }]) {
        const res = await as(csr1).post(`/api/v1/followups/${f.id}/done`).send(payload);
        expect(res.status).toBe(422);
        expect(res.body).toMatchObject({
          errorCode: "FOLLOWUP_OUTCOME_REQUIRED",
          message: "Record what happened before marking the follow-up done. It is added to the client's timeline.",
          errors: [{ field: "outcome", message: "Record what happened." }],
        });
      }
      const long = await as(csr1).post(`/api/v1/followups/${f.id}/done`).send({ outcome: "o".repeat(2001) });
      expect(long.status).toBe(422);
      expect(long.body.errors).toEqual([{ field: "outcome", message: "The outcome can't be longer than 2000 characters." }]);
      expect(await t.prisma.followUp.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ status: "OPEN", outcome: "" });
      expect(await t.prisma.interaction.count()).toBe(0);
    });

    it("marks it done, and writes the interaction of the same kind to the client's timeline, in one step", async () => {
      const f = await seed(csr1, client1, dayOffset(1), { type: "MEETING" });
      const res = await as(csr1).post(`/api/v1/followups/${f.id}/done`).send({ outcome: "  Met in person; documents handed over  " });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: "DONE", outcome: "Met in person; documents handed over" });
      expect(res.body.data.doneAt).not.toBeNull();

      const interactions = await t.prisma.interaction.findMany({ where: { clientId: client1.id } });
      expect(interactions).toMatchObject([{ kind: "MEETING", text: "Met in person; documents handed over", byId: csr1.id }]);
      expect(await t.prisma.auditLog.count({ where: { action: "Completed follow-up with Alex Client", actorId: csr1.id } })).toBe(1);

      const timeline = await as(csr1).get(`/api/v1/clients/${client1.id}/interactions`);
      expect(timeline.body.data).toMatchObject([{ kind: "MEETING", text: "Met in person; documents handed over", by: { id: csr1.id, name: "Cora CSR" } }]);
    });

    it("accepts exactly 1 and exactly 2000 characters", async () => {
      const a = await seed(csr1, client1, dayOffset(1));
      const b = await seed(csr1, client1, dayOffset(1));
      expect((await as(csr1).post(`/api/v1/followups/${a.id}/done`).send({ outcome: "x" })).status).toBe(200);
      expect((await as(csr1).post(`/api/v1/followups/${b.id}/done`).send({ outcome: "y".repeat(2000) })).status).toBe(200);
    });

    it("refuses to complete one that is already done, and writes no second interaction, even when two requests race", async () => {
      const f = await seed(csr1, client1, dayOffset(1));
      const [a, b] = await Promise.all([
        as(csr1).post(`/api/v1/followups/${f.id}/done`).send({ outcome: "Spoke first" }),
        as(manager).post(`/api/v1/followups/${f.id}/done`).send({ outcome: "Spoke second" }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect((a.status === 409 ? a : b).body.errorCode).toBe("FOLLOWUP_DONE");
      expect(await t.prisma.interaction.count({ where: { clientId: client1.id } })).toBe(1);
    });
  });

  describe("follow-ups: edit and delete", () => {
    it("edits an open follow-up's type, date and note", async () => {
      const f = await seed(csr1, client1, dayOffset(1));
      const res = await as(csr1).patch(`/api/v1/followups/${f.id}`).send({ type: "EMAIL", due: dayOffset(7), note: "Send the checklist" });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ type: "EMAIL", due: dayOffset(7), note: "Send the checklist" });
      expect(await t.prisma.auditLog.count({ where: { action: { startsWith: "Edited follow-up for Alex Client" } } })).toBe(1);
    });

    it("does not allow a done follow-up to be edited", async () => {
      const f = await seed(csr1, client1, dayOffset(1));
      await as(csr1).post(`/api/v1/followups/${f.id}/done`).send({ outcome: "All sorted" });
      const res = await as(csr1).patch(`/api/v1/followups/${f.id}`).send({ note: "Rewrite history" });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ errorCode: "FOLLOWUP_DONE", message: "This follow-up is already done, so it can't be edited. Record a new follow-up instead." });
      expect(await t.prisma.followUp.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ note: "Seeded", outcome: "All sorted" });
    });

    it("lets an overdue follow-up keep its date while its note changes, but not move to a date that has passed", async () => {
      const f = await seed(csr1, client1, dayOffset(-5));
      expect((await as(csr1).patch(`/api/v1/followups/${f.id}`).send({ note: "Still chasing" })).status).toBe(200);
      expect((await as(csr1).patch(`/api/v1/followups/${f.id}`).send({ due: dayOffset(-5), note: "Same date again" })).status).toBe(200);
      const back = await as(csr1).patch(`/api/v1/followups/${f.id}`).send({ due: dayOffset(-1) });
      expect(back.status).toBe(422);
      expect(back.body.errorCode).toBe("FOLLOWUP_DATE_IN_PAST");
      expect((await as(csr1).patch(`/api/v1/followups/${f.id}`).send({ due: dayOffset(1) })).status).toBe(200);
    });

    it("refuses an empty change and an invalid value", async () => {
      const f = await seed(csr1, client1, dayOffset(1));
      expect((await as(csr1).patch(`/api/v1/followups/${f.id}`).send({})).body.errors).toEqual([{ field: "body", message: "Send at least one field to change." }]);
      expect((await as(csr1).patch(`/api/v1/followups/${f.id}`).send({ type: "FAX" })).status).toBe(422);
    });

    it("deletes an open follow-up and never a done one", async () => {
      const open = await seed(csr1, client1, dayOffset(1));
      const done = await seed(csr1, client1, dayOffset(1), { status: "DONE", outcome: "x", doneAt: new Date() });
      expect((await as(csr1).delete(`/api/v1/followups/${open.id}`)).status).toBe(200);
      expect(await t.prisma.followUp.count({ where: { id: open.id } })).toBe(0);
      const refused = await as(csr1).delete(`/api/v1/followups/${done.id}`);
      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ errorCode: "FOLLOWUP_DONE", message: "Only open follow-ups can be deleted. A completed one stays in the client's history." });
      expect(await t.prisma.followUp.count({ where: { id: done.id } })).toBe(1);
    });
  });

  describe("interactions", () => {
    it("records who and when, newest first", async () => {
      const first = await as(csr1).post(`/api/v1/clients/${client1.id}/interactions`).send({ kind: "CALL", text: "  Left a voicemail  " });
      expect(first.status).toBe(201);
      expect(first.body.data).toMatchObject({ kind: "CALL", text: "Left a voicemail", by: { id: csr1.id, name: "Cora CSR" } });
      expect(new Date(first.body.data.at).getTime()).toBeGreaterThan(Date.now() - 60_000);
      await as(manager).post(`/api/v1/clients/${client1.id}/interactions`).send({ kind: "EMAIL", text: "Sent the checklist" });

      const list = await as(admin).get(`/api/v1/clients/${client1.id}/interactions`);
      expect(list.body.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
      expect(list.body.data.map((i: { text: string }) => i.text)).toEqual(["Sent the checklist", "Left a voicemail"]);
      expect((await as(admin).get(`/api/v1/clients/${client1.id}/interactions?order=asc`)).body.data[0].text).toBe("Left a voicemail");
      expect(await t.prisma.auditLog.count({ where: { action: "Recorded call with Alex Client" } })).toBe(1);
    });

    it("keeps a CSR to their own clients with 404, and everyone else out", async () => {
      expect((await as(csr1).get(`/api/v1/clients/${client2.id}/interactions`)).status).toBe(404);
      expect((await as(csr1).post(`/api/v1/clients/${client2.id}/interactions`).send({ kind: "CALL", text: "Snooping" })).status).toBe(404);
      expect((await as(csr1).get(`/api/v1/clients/${orphan.id}/interactions`)).status).toBe(404);
      for (const who of [compliance, client1]) {
        expect((await as(who).get(`/api/v1/clients/${client1.id}/interactions`)).status).toBe(403);
        expect((await as(who).post(`/api/v1/clients/${client1.id}/interactions`).send({ kind: "CALL", text: "x" })).status).toBe(403);
      }
      expect(await t.prisma.interaction.count()).toBe(0);
    });

    it("validates the kind and the text (1 to 2000), and refuses a removed client", async () => {
      const post = (body: Record<string, unknown>) => as(csr1).post(`/api/v1/clients/${client1.id}/interactions`).send(body);
      expect((await post({ kind: "SEANCE", text: "x" })).body.errors[0].field).toBe("kind");
      expect((await post({ kind: "CALL", text: "   " })).body.errors).toEqual([{ field: "text", message: "Summarize the interaction." }]);
      expect((await post({ kind: "CALL", text: "t".repeat(2001) })).body.errors[0].message).toBe("The summary can't be longer than 2000 characters.");
      expect((await post({ kind: "CALL", text: "t".repeat(2000) })).status).toBe(201);
      expect((await post({ kind: "CALL", text: "t" })).status).toBe(201);

      await t.prisma.user.update({ where: { id: client1.id }, data: { status: "REMOVED", deletedAt: new Date() } });
      expect((await as(admin).post(`/api/v1/clients/${client1.id}/interactions`).send({ kind: "CALL", text: "late" })).body.errorCode).toBe("USER_REMOVED");
    });

    it("pages the timeline and rejects bad paging with a message on the field", async () => {
      for (let i = 0; i < 3; i++) await as(csr1).post(`/api/v1/clients/${client1.id}/interactions`).send({ kind: "CALL", text: `Call ${i}` });
      const page = await as(csr1).get(`/api/v1/clients/${client1.id}/interactions?limit=2&page=2`);
      expect(page.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
      expect(page.body.data).toHaveLength(1);
      expect((await as(csr1).get(`/api/v1/clients/${client1.id}/interactions?limit=101`)).body.errors[0].field).toBe("limit");
      expect((await as(csr1).get(`/api/v1/clients/${client1.id}/interactions?sort=text`)).body.errors[0].field).toBe("sort");
    });
  });
});
