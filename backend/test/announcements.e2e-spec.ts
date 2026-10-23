import { api, bearerFor, createAppWithMail, dayOffset, makeUser, resetDatabase, type RecordingMail, type TestApp } from "./helpers";

type User = Awaited<ReturnType<typeof makeUser>>;

describe("announcements (e2e)", () => {
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
  let suspended: User;
  let invited: User;
  let removed: User;

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    t.mail.sent = [];
    t.mail.failWith = null;
    admin = await makeUser(t.prisma, { email: "admin@test.dev", name: "Ada Admin", role: "ADMIN" });
    manager = await makeUser(t.prisma, { email: "manager@test.dev", name: "Max Manager", role: "MANAGER" });
    csr1 = await makeUser(t.prisma, { email: "csr1@test.dev", name: "Cora CSR", role: "CSR" });
    compliance = await makeUser(t.prisma, { email: "comp@test.dev", name: "Cleo Compliance", role: "COMPLIANCE" });
    client1 = await makeUser(t.prisma, { email: "client1@test.dev", name: "Alex Client", role: "CLIENT", csrId: csr1.id });
    client2 = await makeUser(t.prisma, { email: "client2@test.dev", name: "Bea Client", role: "CLIENT", csrId: csr1.id });
    suspended = await makeUser(t.prisma, { email: "sus@test.dev", name: "Sam Suspended", role: "CLIENT", status: "SUSPENDED" });
    invited = await makeUser(t.prisma, { email: "inv@test.dev", name: "Ivy Invited", role: "CLIENT", status: "INVITED", password: false });
    removed = await makeUser(t.prisma, { email: "rem@test.dev", name: "Rex Removed", role: "CLIENT", status: "REMOVED" });
    await t.prisma.user.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });
  });

  const as = (user: { id: string; role: Parameters<typeof bearerFor>[1]["role"] }) => api(t, bearerFor(t, user));
  const make = (who: User, extra: Record<string, unknown> = {}) =>
    as(who).post("/api/v1/announcements").send({ title: "Office closed on Friday", message: "We are closed this Friday for a public holiday.", ...extra });
  const ids = async (who: User, query = ""): Promise<string[]> => (await as(who).get(`/api/v1/announcements${query}`)).body.data.map((a: { id: string }) => a.id);
  /** An announcement straight in the database, so a test can have any status, expiry or audience. */
  const seed = (extra: Record<string, unknown> = {}) =>
    t.prisma.announcement.create({
      data: { title: "Seeded", message: "Seeded message", createdById: admin.id, status: "PUBLISHED", publishedAt: new Date(), ...extra },
    });
  const date = (days: number) => new Date(`${dayOffset(days)}T00:00:00.000Z`);

  describe("writing", () => {
    it("saves a draft by default, or publishes at once, for Admin, Manager and Compliance", async () => {
      const draft = await make(admin);
      expect(draft.status).toBe(201);
      expect(draft.body.message).toBe("Draft saved.");
      expect(draft.body.data).toMatchObject({ title: "Office closed on Friday", status: "DRAFT", priority: "NORMAL", requireAck: false, publishedAt: null, expiresAt: null, audience: { type: "all" }, createdBy: { id: admin.id, name: "Ada Admin" }, acks: null });
      for (const who of [manager, compliance]) {
        const res = await make(who, { publish: true, priority: "URGENT" });
        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ status: "PUBLISHED", priority: "URGENT" });
        expect(res.body.data.publishedAt).not.toBeNull();
        expect(res.body.message).toBe("Published. In-app notifications were created.");
      }
      expect(await t.prisma.auditLog.count({ where: { action: "Drafted announcement “Office closed on Friday”", category: "announcements" } })).toBe(1);
      expect(await t.prisma.auditLog.count({ where: { action: "Published announcement “Office closed on Friday”" } })).toBe(2);
    });

    it("refuses a CSR and a client with the rule's message", async () => {
      for (const who of [csr1, client1]) {
        const res = await make(who);
        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Only Admin, Manager and Compliance can publish announcements.");
      }
      expect(await t.prisma.announcement.count()).toBe(0);
    });

    it("validates title and message (1 to 200, 1 to 5000)", async () => {
      const res = await as(admin).post("/api/v1/announcements").send({ title: "t".repeat(201), message: "m".repeat(5001), priority: "LOUD", requireAck: "yes", extra: 1 });
      expect(res.status).toBe(422);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          { field: "title", message: "The title can't be longer than 200 characters." },
          { field: "message", message: "The message can't be longer than 5000 characters." },
          { field: "priority", message: expect.stringContaining("priority must be one of") },
          { field: "requireAck", message: "requireAck must be true or false." },
          { field: "extra", message: "property extra should not exist" },
        ]),
      );
      expect((await make(admin, { title: "   " })).body.errors).toEqual([{ field: "title", message: "Add a title." }]);
      expect((await make(admin, { message: "" })).body.errors).toEqual([{ field: "message", message: "Add a message." }]);
      expect((await make(admin, { title: "t".repeat(200), message: "m".repeat(5000) })).status).toBe(201);
      expect((await make(admin, { title: "t", message: "m" })).status).toBe(201);
    });

    it("accepts 'all clients' or one active client as the audience, and nothing else", async () => {
      expect((await make(admin, { audience: "all" })).body.data.audience).toEqual({ type: "all" });
      expect((await make(admin, { audience: client1.id })).body.data.audience).toEqual({ type: "client", id: client1.id, name: "Alex Client" });
      for (const [audience, text] of [[suspended.id, "isn't active"], [invited.id, "isn't active"], [removed.id, "couldn't find"], ["nobody", "couldn't find"], [csr1.id, "couldn't find"]] as const) {
        const res = await make(admin, { audience });
        expect(res.status).toBe(422);
        expect(res.body.errorCode).toBe("ANNOUNCEMENT_AUDIENCE_INVALID");
        expect(res.body.message).toContain(text);
        expect(res.body.errors[0].field).toBe("audienceId");
      }
    });

    it("takes an expiry of today or later by the server's date, and refuses a past one", async () => {
      expect((await make(admin, { expiresAt: dayOffset(0) })).body.data.expiresAt).toBe(dayOffset(0));
      expect((await make(admin, { expiresAt: dayOffset(30) })).status).toBe(201);
      const past = await make(admin, { expiresAt: dayOffset(-1) });
      expect(past.status).toBe(422);
      expect(past.body).toMatchObject({
        errorCode: "ANNOUNCEMENT_EXPIRY_PAST",
        message: `The expiry date ${dayOffset(-1)} has already passed. Choose today or a later date, or leave it empty for no expiry.`,
        errors: [{ field: "expiresAt", message: "Choose today or a later date." }],
      });
      const bad = await make(admin, { expiresAt: "31/12/2030" });
      expect(bad.body.errorCode).toBe("VALIDATION_FAILED");
      expect(bad.body.errors[0].field).toBe("expiresAt");
      expect(await t.prisma.announcement.count()).toBe(2);
    });

    it("never takes 'today' from the caller: a date sent with the request is refused or ignored", async () => {
      // A client-sent "today" isn't an accepted field, so it can't move the expiry judgement.
      const res = await as(admin).post("/api/v1/announcements").send({ title: "x", message: "y", expiresAt: dayOffset(-5), today: dayOffset(-10) });
      expect(res.status).toBe(422);
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain("today");
      const lie = await as(admin).post("/api/v1/announcements").set("Date", "Mon, 01 Jan 2001 00:00:00 GMT").send({ title: "x", message: "y", expiresAt: dayOffset(-5) });
      expect(lie.body.errorCode).toBe("ANNOUNCEMENT_EXPIRY_PAST");
    });
  });

  describe("drafts, publishing, archiving", () => {
    it("edits a draft, but not a published or archived announcement", async () => {
      const id = (await make(admin)).body.data.id as string;
      const edit = await as(manager).patch(`/api/v1/announcements/${id}`).send({ title: "New title", priority: "IMPORTANT", requireAck: true, audience: client1.id, expiresAt: dayOffset(10) });
      expect(edit.status).toBe(200);
      expect(edit.body.data).toMatchObject({ title: "New title", priority: "IMPORTANT", requireAck: true, audience: { type: "client", id: client1.id }, expiresAt: dayOffset(10) });
      expect((await as(manager).patch(`/api/v1/announcements/${id}`).send({ expiresAt: null, audience: "all" })).body.data).toMatchObject({ expiresAt: null, audience: { type: "all" } });

      await as(admin).post(`/api/v1/announcements/${id}/publish`).send();
      const published = await as(admin).patch(`/api/v1/announcements/${id}`).send({ title: "Sneaky change" });
      expect(published.status).toBe(409);
      expect(published.body).toMatchObject({ errorCode: "ANNOUNCEMENT_NOT_DRAFT" });
      expect(published.body.message).toBe('"New title" is already published, so it can\'t be edited: clients may have read it. Archive it and publish a new one instead.');
      await as(admin).post(`/api/v1/announcements/${id}/archive`).send();
      const archived = await as(admin).patch(`/api/v1/announcements/${id}`).send({ title: "Too late" });
      expect(archived.body.message).toBe('"New title" is archived, so it can\'t be edited or published again. Create a new announcement instead.');
      expect((await t.prisma.announcement.findUniqueOrThrow({ where: { id } })).title).toBe("New title");
    });

    it("validates a draft edit like a new one", async () => {
      const id = (await make(admin)).body.data.id as string;
      expect((await as(admin).patch(`/api/v1/announcements/${id}`).send({})).body.errors).toEqual([{ field: "body", message: "Send at least one field to change." }]);
      expect((await as(admin).patch(`/api/v1/announcements/${id}`).send({ expiresAt: dayOffset(-2) })).body.errorCode).toBe("ANNOUNCEMENT_EXPIRY_PAST");
      expect((await as(admin).patch(`/api/v1/announcements/${id}`).send({ audience: suspended.id })).body.errorCode).toBe("ANNOUNCEMENT_AUDIENCE_INVALID");
      expect((await as(admin).patch(`/api/v1/announcements/${id}`).send({ title: "" })).body.errors[0].message).toBe("Add a title.");
      for (const who of [csr1, client1]) expect((await as(who).patch(`/api/v1/announcements/${id}`).send({ title: "Mine" })).status).toBe(403);
    });

    it("publishes a draft once, and archives only a published announcement", async () => {
      const id = (await make(admin)).body.data.id as string;
      const draftArchive = await as(admin).post(`/api/v1/announcements/${id}/archive`).send();
      expect(draftArchive.status).toBe(409);
      expect(draftArchive.body).toMatchObject({ errorCode: "ANNOUNCEMENT_NOT_PUBLISHED", message: '"Office closed on Friday" is still a draft, so there is nothing to archive. Publish it, or edit it.' });
      const published = await as(admin).post(`/api/v1/announcements/${id}/publish`).send();
      expect(published.body.data.status).toBe("PUBLISHED");
      expect((await as(admin).post(`/api/v1/announcements/${id}/publish`).send()).body.errorCode).toBe("ANNOUNCEMENT_NOT_DRAFT");
      expect((await as(admin).post(`/api/v1/announcements/${id}/archive`).send()).body.data.status).toBe("ARCHIVED");
      const again = await as(admin).post(`/api/v1/announcements/${id}/archive`).send();
      expect(again.body).toMatchObject({ errorCode: "ANNOUNCEMENT_NOT_PUBLISHED", message: '"Office closed on Friday" is already archived.' });
      expect((await as(admin).post(`/api/v1/announcements/${id}/publish`).send()).body.errorCode).toBe("ANNOUNCEMENT_NOT_DRAFT");
      for (const who of [csr1, client1]) {
        expect((await as(who).post(`/api/v1/announcements/${id}/publish`).send()).status).toBe(403);
        expect((await as(who).post(`/api/v1/announcements/${id}/archive`).send()).status).toBe(403);
      }
      expect((await as(admin).post("/api/v1/announcements/nope/publish").send()).status).toBe(404);
    });

    it("refuses to publish a draft whose expiry has passed since, or whose client is no longer active", async () => {
      const stale = await seed({ status: "DRAFT", publishedAt: null, expiresAt: date(-3), title: "Stale draft" });
      const res = await as(admin).post(`/api/v1/announcements/${stale.id}/publish`).send();
      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe("ANNOUNCEMENT_EXPIRY_PAST");
      expect(await t.prisma.notification.count()).toBe(0);
      const forGone = await seed({ status: "DRAFT", publishedAt: null, audienceId: suspended.id, title: "For a suspended client" });
      expect((await as(admin).post(`/api/v1/announcements/${forGone.id}/publish`).send()).body.errorCode).toBe("ANNOUNCEMENT_AUDIENCE_INVALID");
      expect((await t.prisma.announcement.findUniqueOrThrow({ where: { id: forGone.id } })).status).toBe("DRAFT");
    });
  });

  describe("what a client can see", () => {
    let live: { id: string };
    let forAlex: { id: string };
    let forBea: { id: string };
    let draft: { id: string };
    let archived: { id: string };
    let expired: { id: string };
    let lastDay: { id: string };
    beforeEach(async () => {
      live = await seed({ title: "For everyone" });
      forAlex = await seed({ title: "Only Alex", audienceId: client1.id });
      forBea = await seed({ title: "Only Bea", audienceId: client2.id });
      draft = await seed({ title: "A draft", status: "DRAFT", publishedAt: null });
      archived = await seed({ title: "Archived", status: "ARCHIVED" });
      expired = await seed({ title: "Expired yesterday", expiresAt: date(-1) });
      lastDay = await seed({ title: "Expires today", expiresAt: date(0) });
    });

    it("lists only published, unexpired announcements for everyone or for them", async () => {
      expect((await ids(client1)).sort()).toEqual([live.id, forAlex.id, lastDay.id].sort());
      expect((await ids(client2)).sort()).toEqual([live.id, forBea.id, lastDay.id].sort());
    });

    it("judges expiry by the server's date: an announcement is still shown on its last day and gone the day after", async () => {
      expect(await ids(client1)).toContain(lastDay.id);
      await t.prisma.announcement.update({ where: { id: lastDay.id }, data: { expiresAt: date(-1) } });
      expect(await ids(client1)).not.toContain(lastDay.id);
      await t.prisma.announcement.update({ where: { id: lastDay.id }, data: { expiresAt: date(1) } });
      expect(await ids(client1)).toContain(lastDay.id);
    });

    it("gives 404, not 403, for a draft, an archived, an expired or another client's announcement", async () => {
      for (const hidden of [draft, archived, expired, forBea]) {
        const res = await as(client1).get(`/api/v1/announcements/${hidden.id}`);
        expect(res.status).toBe(404);
        expect(res.body.errorCode).toBe("RESOURCE_NOT_FOUND");
      }
      for (const shown of [live, forAlex, lastDay]) expect((await as(client1).get(`/api/v1/announcements/${shown.id}`)).status).toBe(200);
    });

    it("ignores the filters a client has no business with", async () => {
      expect((await ids(client1, "?status=DRAFT")).sort()).toEqual([live.id, forAlex.id, lastDay.id].sort());
      expect((await ids(client1, `?audience=${client2.id}`)).sort()).toEqual([live.id, forAlex.id, lastDay.id].sort());
    });

    it("shows a client no staff-only fields, and their own acknowledgement state", async () => {
      await t.prisma.announcement.update({ where: { id: live.id }, data: { requireAck: true } });
      const res = await as(client1).get(`/api/v1/announcements/${live.id}`);
      expect(res.body.data).toEqual({
        id: live.id,
        title: "For everyone",
        message: "Seeded message",
        priority: "NORMAL",
        publishedAt: expect.any(String),
        expiresAt: null,
        requireAck: true,
        acknowledged: false,
        acknowledgedAt: null,
      });
      await as(client1).post(`/api/v1/announcements/${live.id}/ack`).send();
      expect((await as(client1).get(`/api/v1/announcements/${live.id}`)).body.data).toMatchObject({ acknowledged: true });
      expect((await as(client2).get(`/api/v1/announcements/${live.id}`)).body.data).toMatchObject({ acknowledged: false });
      for (const hidden of ["status", "audience", "createdBy", "createdAt", "acks"]) expect(res.body.data).not.toHaveProperty(hidden);
    });

    it("shows staff with the announce permission everything, and a CSR what clients see", async () => {
      expect((await ids(admin)).sort()).toEqual([live.id, forAlex.id, forBea.id, draft.id, archived.id, expired.id, lastDay.id].sort());
      for (const who of [manager, compliance]) expect(await ids(who)).toHaveLength(7);
      expect((await ids(csr1)).sort()).toEqual([live.id, forAlex.id, forBea.id, lastDay.id].sort());
      expect((await as(csr1).get(`/api/v1/announcements/${draft.id}`)).status).toBe(404);
      expect((await api(t).get("/api/v1/announcements")).status).toBe(401);
    });

    it("filters staff lists by status, audience and priority, and sorts and paginates", async () => {
      await t.prisma.announcement.update({ where: { id: forAlex.id }, data: { priority: "URGENT" } });
      expect(await ids(admin, "?status=DRAFT")).toEqual([draft.id]);
      expect(await ids(admin, `?audience=${client1.id}`)).toEqual([forAlex.id]);
      expect((await ids(admin, "?audience=all")).sort()).toEqual([live.id, draft.id, archived.id, expired.id, lastDay.id].sort());
      expect(await ids(admin, "?priority=URGENT")).toEqual([forAlex.id]);
      expect((await as(admin).get("/api/v1/announcements?sort=title&order=asc&limit=3")).body.data.map((a: { title: string }) => a.title)).toEqual(["A draft", "Archived", "Expired yesterday"]);
      const page = await as(admin).get("/api/v1/announcements?limit=3&page=3");
      expect(page.body.meta).toEqual({ page: 3, limit: 3, total: 7, totalPages: 3 });
      const bad = await as(admin).get("/api/v1/announcements?page=0&limit=101&status=GONE&priority=LOUD");
      expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["limit", "page", "priority", "status"]);
      expect((await as(admin).get("/api/v1/announcements?sort=message")).body.errors[0].field).toBe("sort");
    });
  });

  describe("acknowledging", () => {
    let required: string;
    beforeEach(async () => {
      required = (await make(admin, { title: "Please confirm", requireAck: true, publish: true })).body.data.id;
    });

    it("records it once, keeps the first time, and says so the second time", async () => {
      const first = await as(client1).post(`/api/v1/announcements/${required}/ack`).send();
      expect(first.status).toBe(200);
      expect(first.body.message).toBe("Acknowledged. Thank you.");
      expect(first.body.data).toMatchObject({ announcementId: required, acknowledged: true, alreadyAcknowledged: false });
      const second = await as(client1).post(`/api/v1/announcements/${required}/ack`).send();
      expect(second.status).toBe(200);
      expect(second.body.message).toBe("You had already acknowledged this announcement.");
      expect(second.body.data).toMatchObject({ alreadyAcknowledged: true, at: first.body.data.at });
      expect(await t.prisma.announcementAck.count({ where: { announcementId: required } })).toBe(1);
      expect(await t.prisma.auditLog.count({ where: { action: "Acknowledged announcement “Please confirm”", actorId: client1.id } })).toBe(1);
    });

    it("records exactly one acknowledgement when two requests arrive together", async () => {
      const [a, b] = await Promise.all([as(client1).post(`/api/v1/announcements/${required}/ack`).send(), as(client1).post(`/api/v1/announcements/${required}/ack`).send()]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(await t.prisma.announcementAck.count({ where: { announcementId: required } })).toBe(1);
      expect([a.body.data.alreadyAcknowledged, b.body.data.alreadyAcknowledged].sort()).toEqual([false, true]);
    });

    it("only lets a client acknowledge an announcement they can see", async () => {
      for (const hidden of [
        await seed({ title: "Draft", status: "DRAFT", publishedAt: null, requireAck: true }),
        await seed({ title: "Archived", status: "ARCHIVED", requireAck: true }),
        await seed({ title: "Expired", expiresAt: date(-1), requireAck: true }),
        await seed({ title: "For Bea", audienceId: client2.id, requireAck: true }),
      ]) {
        const res = await as(client1).post(`/api/v1/announcements/${hidden.id}/ack`).send();
        expect(res.status).toBe(404);
      }
      expect(await t.prisma.announcementAck.count()).toBe(0);
    });

    it("refuses an announcement that doesn't ask for one, and staff and CSRs", async () => {
      const casual = (await make(admin, { title: "Just so you know", publish: true })).body.data.id as string;
      const res = await as(client1).post(`/api/v1/announcements/${casual}/ack`).send();
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ errorCode: "ANNOUNCEMENT_ACK_NOT_REQUIRED", message: '"Just so you know" doesn\'t ask for an acknowledgement, so there is nothing to confirm.' });
      for (const who of [admin, csr1]) {
        const staff = await as(who).post(`/api/v1/announcements/${required}/ack`).send();
        expect(staff.status).toBe(403);
        expect(staff.body.message).toBe("Only clients acknowledge announcements.");
      }
      expect((await api(t).post(`/api/v1/announcements/${required}/ack`).send()).status).toBe(401);
    });

    it("shows staff who has acknowledged and who hasn't, among active clients only", async () => {
      await as(client1).post(`/api/v1/announcements/${required}/ack`).send();
      const res = await as(manager).get(`/api/v1/announcements/${required}/acks`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ announcementId: required, acknowledged: 1, total: 2 });
      expect(res.body.data.clients.map((c: { name: string; acknowledged: boolean }) => [c.name, c.acknowledged])).toEqual([["Alex Client", true], ["Bea Client", false]]);
      const list = (await as(admin).get(`/api/v1/announcements/${required}`)).body.data;
      expect(list.acks).toEqual({ acknowledged: 1, total: 2 });
      // For one client the denominator is one.
      const single = (await make(admin, { title: "Just you", audience: client2.id, requireAck: true, publish: true })).body.data;
      expect(single.acks).toEqual({ acknowledged: 0, total: 1 });
      expect((await as(admin).get(`/api/v1/announcements/${single.id}/acks`)).body.data.clients.map((c: { name: string }) => c.name)).toEqual(["Bea Client"]);
    });

    it("keeps the acknowledgement list from CSRs and clients, and from announcements that don't ask for one", async () => {
      for (const who of [csr1, client1]) expect((await as(who).get(`/api/v1/announcements/${required}/acks`)).status).toBe(403);
      const casual = (await make(admin, { publish: true })).body.data.id as string;
      expect((await as(admin).get(`/api/v1/announcements/${casual}/acks`)).body.errorCode).toBe("ANNOUNCEMENT_ACK_NOT_REQUIRED");
    });
  });

  describe("publishing notifies the audience", () => {
    it("reaches every active client, and nobody else, for 'all clients'", async () => {
      t.mail.sent = [];
      await make(admin, { title: "Holiday hours", publish: true });
      for (const who of [client1, client2]) expect(await t.prisma.notification.count({ where: { userId: who.id, text: "Announcement: Holiday hours", link: "home" } })).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: { in: [suspended.id, invited.id, removed.id, admin.id, manager.id, csr1.id, compliance.id] } } })).toBe(0);
      expect(t.mail.sent.filter((m) => m.kind === "notification").map((m) => m.to).sort()).toEqual(["client1@test.dev", "client2@test.dev"]);
    });

    it("reaches just that client for a one-client announcement", async () => {
      await make(admin, { title: "Just for Alex", audience: client1.id, publish: true });
      expect(await t.prisma.notification.count({ where: { userId: client1.id } })).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: client2.id } })).toBe(0);
    });

    it("notifies on publish, not when a draft is saved, and again never on archive", async () => {
      const id = (await make(admin, { title: "Draft first" })).body.data.id as string;
      expect(await t.prisma.notification.count()).toBe(0);
      await as(admin).post(`/api/v1/announcements/${id}/publish`).send();
      expect(await t.prisma.notification.count()).toBe(2);
      await as(admin).post(`/api/v1/announcements/${id}/archive`).send();
      expect(await t.prisma.notification.count()).toBe(2);
    });

    it("follows each client's ANNOUNCEMENTS preferences, in-app and email separately", async () => {
      await t.prisma.notificationPreference.create({ data: { userId: client1.id, category: "ANNOUNCEMENTS", inApp: false, email: true } });
      await t.prisma.notificationPreference.create({ data: { userId: client2.id, category: "ANNOUNCEMENTS", inApp: true, email: false } });
      await make(admin, { title: "Preferences", publish: true });
      expect(await t.prisma.notification.count({ where: { userId: client1.id } })).toBe(0);
      expect(await t.prisma.notification.count({ where: { userId: client2.id } })).toBe(1);
      expect(t.mail.sent.filter((m) => m.kind === "notification").map((m) => m.to)).toEqual(["client1@test.dev"]);
    });

    it("still publishes when the email can't be sent after the commit", async () => {
      t.mail.failWith = new Error("SMTP is down");
      const res = await make(admin, { publish: true });
      expect(res.status).toBe(201);
      expect(await t.prisma.notification.count()).toBe(2);
    });
  });
});
