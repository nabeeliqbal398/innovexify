import { createHash } from "node:crypto";

import { UsersService } from "../src/modules/users/service/users.service";
import { api, bearerFor, createAppWithMail, login, makeCase, makeUser, PASSWORD, resetDatabase, withCookie, type TestApp, type RecordingMail } from "./helpers";

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

describe("users (e2e)", () => {
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

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    t.mail.sent = [];
    t.mail.failWith = null;
    admin = await makeUser(t.prisma, { email: "admin@test.dev", name: "Ada Admin", role: "ADMIN" });
    manager = await makeUser(t.prisma, { email: "manager@test.dev", name: "Max Manager", role: "MANAGER" });
    csr1 = await makeUser(t.prisma, { email: "csr1@test.dev", name: "Cora CSR", role: "CSR" });
    csr2 = await makeUser(t.prisma, { email: "csr2@test.dev", name: "Carl CSR", role: "CSR" });
    compliance = await makeUser(t.prisma, { email: "comp@test.dev", name: "Cleo Compliance", role: "COMPLIANCE" });
  });

  const as = (user: { id: string; role: Parameters<typeof bearerFor>[1]["role"] }) => api(t, bearerFor(t, user));

  describe("invitation flow", () => {
    it("invites, accepts and signs in, end to end", async () => {
      const invite = await as(admin).post("/api/v1/users").send({ email: "New.CSR@Test.dev", name: "Nina New", role: "CSR", note: "Welcome aboard" });
      expect(invite.status).toBe(201);
      expect(invite.body.data).toMatchObject({ email: "new.csr@test.dev", name: "Nina New", role: "CSR", status: "INVITED", invitedById: admin.id });
      expect(invite.body.data.passwordHash).toBeUndefined();

      // The email went through MailService, with a one-time link and the personal note.
      expect(t.mail.sent).toHaveLength(1);
      expect(t.mail.sent[0]).toMatchObject({ to: "new.csr@test.dev", kind: "invitation" });
      expect(t.mail.sent[0].text).toContain("Welcome aboard");
      const token = t.mail.inviteTokenFor("new.csr@test.dev");

      // Only a hash is stored, with an expiry.
      const stored = await t.prisma.invitationToken.findFirstOrThrow({ where: { userId: invite.body.data.id } });
      expect(stored.tokenHash).toBe(sha256(token));
      expect(JSON.stringify(stored)).not.toContain(token);
      expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);

      const lookup = await t.http().get(`/api/v1/auth/invitations/${token}`);
      expect(lookup.status).toBe(200);
      expect(lookup.body.data).toMatchObject({ email: "new.csr@test.dev", role: "CSR", invitedBy: "Ada Admin" });

      const accept = await t.http().post("/api/v1/auth/accept-invitation").send({ token, password: PASSWORD });
      expect(accept.status).toBe(200);
      expect(accept.body.data.user).toMatchObject({ email: "new.csr@test.dev", status: "ACTIVE" });

      const signIn = await login(t, "new.csr@test.dev");
      expect(signIn.res.status).toBe(200);
      expect(signIn.res.body.data.user.role).toBe("CSR");

      // The link works once.
      const again = await t.http().post("/api/v1/auth/accept-invitation").send({ token, password: PASSWORD });
      expect(again.status).toBe(409);
      expect(again.body.errorCode).toBe("INVITATION_USED");

      const audit = await t.prisma.auditLog.findFirst({ where: { action: "Invited CSR new.csr@test.dev" } });
      expect(audit).toMatchObject({ actorId: admin.id, category: "users", ok: true });
    });

    it("follows the permission table for who may invite which role", async () => {
      const managerInvitesManager = await as(manager).post("/api/v1/users").send({ email: "m2@test.dev", role: "MANAGER" });
      expect(managerInvitesManager.status).toBe(403);
      expect(managerInvitesManager.body).toMatchObject({ errorCode: "PERMISSION_DENIED", message: "Only Admin can invite Managers." });

      const managerInvitesCsr = await as(manager).post("/api/v1/users").send({ email: "c3@test.dev", role: "CSR" });
      expect(managerInvitesCsr.status).toBe(201);
      const managerInvitesCompliance = await as(manager).post("/api/v1/users").send({ email: "k3@test.dev", role: "COMPLIANCE" });
      expect(managerInvitesCompliance.status).toBe(201);
      const adminInvitesManager = await as(admin).post("/api/v1/users").send({ email: "m3@test.dev", role: "MANAGER" });
      expect(adminInvitesManager.status).toBe(201);

      for (const who of [csr1, compliance]) {
        const res = await as(who).post("/api/v1/users").send({ email: "x@test.dev", role: "CSR" });
        expect(res.status).toBe(403);
        expect(res.body.errorCode).toBe("PERMISSION_DENIED");
      }
      // The refusal is audited as a refusal.
      const refused = await t.prisma.auditLog.findFirst({ where: { action: "Refused: inviteMANAGER", ok: false } });
      expect(refused?.actorId).toBe(manager.id);
    });

    it("explains that Admins and clients are not invited through this route", async () => {
      const adminRole = await as(admin).post("/api/v1/users").send({ email: "a2@test.dev", role: "ADMIN" });
      expect(adminRole.status).toBe(422);
      expect(adminRole.body).toMatchObject({ errorCode: "INVALID_INVITE_ROLE", message: "Admin accounts can't be created by invitation." });

      const clientRole = await as(admin).post("/api/v1/users").send({ email: "c2@test.dev", role: "CLIENT" });
      expect(clientRole.status).toBe(422);
      expect(clientRole.body.errorCode).toBe("INVALID_INVITE_ROLE");
      expect(clientRole.body.message).toContain("POST /clients");
    });

    it("rejects a duplicate email case-insensitively, naming the email", async () => {
      const res = await as(admin).post("/api/v1/users").send({ email: "CSR1@Test.dev", role: "CSR" });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ errorCode: "EMAIL_IN_USE", errors: [{ field: "email", message: "This email is already in use." }] });
      expect(res.body.message).toContain("csr1@test.dev");
      expect(t.mail.sent).toHaveLength(0);
    });

    it("lets a removed account's email be used again, and still refuses duplicates at the database", async () => {
      await t.prisma.user.update({ where: { id: csr2.id }, data: { status: "REMOVED", deletedAt: new Date() } });
      const reuse = await as(admin).post("/api/v1/users").send({ email: "csr2@test.dev", role: "CSR" });
      expect(reuse.status).toBe(201);
      // Two live accounts can't share an email even if the application check is skipped (partial unique index).
      await expect(t.prisma.user.create({ data: { email: "CSR2@test.dev", name: "Dupe", role: "CSR", status: "ACTIVE" } })).rejects.toMatchObject({ code: "P2002" });
    });

    it("rolls the account back when the invitation email can't be sent", async () => {
      t.mail.failWith = new Error("SMTP is down");
      const res = await as(admin).post("/api/v1/users").send({ email: "ghost@test.dev", role: "CSR" });
      expect(res.status).toBe(500);
      expect(await t.prisma.user.count({ where: { email: "ghost@test.dev" } })).toBe(0);
      expect(await t.prisma.invitationToken.count()).toBe(0);
    });

    it("validates each field", async () => {
      const res = await as(admin).post("/api/v1/users").send({ email: "nope", role: "WIZARD", name: "x".repeat(121) });
      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe("VALIDATION_FAILED");
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          { field: "email", message: "Enter a valid email address." },
          { field: "role", message: expect.stringContaining("role must be one of") },
          { field: "name", message: "The name can't be longer than 120 characters." },
        ]),
      );
    });

    it("resends an invitation: a fresh link, and the earlier one stops working", async () => {
      const invite = await as(admin).post("/api/v1/users").send({ email: "later@test.dev", role: "COMPLIANCE" });
      const first = t.mail.inviteTokenFor("later@test.dev");

      const resend = await as(manager).post(`/api/v1/users/${invite.body.data.id}/resend-invitation`).send();
      expect(resend.status).toBe(200);
      const second = t.mail.inviteTokenFor("later@test.dev");
      expect(second).not.toBe(first);
      expect(t.mail.sent).toHaveLength(2);

      const old = await t.http().get(`/api/v1/auth/invitations/${first}`);
      expect(old.status).toBe(410);
      expect(old.body.errorCode).toBe("INVITATION_EXPIRED");
      expect((await t.http().get(`/api/v1/auth/invitations/${second}`)).status).toBe(200);
    });

    it("refuses to resend to someone who already accepted", async () => {
      const res = await as(admin).post(`/api/v1/users/${csr1.id}/resend-invitation`).send();
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe("INVITATION_NOT_PENDING");
      expect(res.body.message).toContain("Cora CSR");
    });
  });

  describe("suspend, reactivate, remove", () => {
    it("rejects a suspended user's token immediately and ends their sessions", async () => {
      const { res, cookie, accessToken } = await login(t, "csr1@test.dev");
      expect(res.status).toBe(200);
      const me = await api(t, `Bearer ${accessToken}`).get("/api/v1/auth/me");
      expect(me.status).toBe(200);

      const suspend = await as(admin).patch(`/api/v1/users/${csr1.id}/status`).send({ status: "SUSPENDED", reason: "Under review" });
      expect(suspend.status).toBe(200);
      expect(suspend.body.data.status).toBe("SUSPENDED");

      // The very same access token is refused on its next use, long before it would expire.
      const after = await api(t, `Bearer ${accessToken}`).get("/api/v1/auth/me");
      expect(after.status).toBe(403);
      expect(after.body.errorCode).toBe("ACCOUNT_INACTIVE");
      expect(after.body.message).toContain("suspended");

      // The refresh token is dead too.
      const refresh = await t.http().post("/api/v1/auth/refresh").set("X-Forwarded-For", "10.9.9.9").set("Cookie", withCookie(cookie ?? "")).send({});
      expect([401, 403]).toContain(refresh.status);
      expect(await t.prisma.refreshToken.count({ where: { userId: csr1.id, revokedAt: null } })).toBe(0);

      const audit = await t.prisma.auditLog.findFirst({ where: { action: { startsWith: "Suspended Cora CSR" } } });
      expect(audit?.action).toContain("reason: Under review");

      // Reactivating brings the account back.
      const reactivate = await as(admin).patch(`/api/v1/users/${csr1.id}/status`).send({ status: "ACTIVE" });
      expect(reactivate.status).toBe(200);
      expect((await login(t, "csr1@test.dev")).res.status).toBe(200);
    });

    it("rejects a removed user's token immediately", async () => {
      const token = bearerFor(t, csr2);
      expect((await api(t, token).get("/api/v1/auth/me")).status).toBe(200);
      expect((await as(admin).delete(`/api/v1/users/${csr2.id}`)).status).toBe(200);
      const after = await api(t, token).get("/api/v1/auth/me");
      expect(after.status).toBe(401);
      expect(after.body.errorCode).toBe("UNAUTHENTICATED");
    });

    it("won't let you suspend or remove yourself, with a message that says so", async () => {
      const suspend = await as(admin).patch(`/api/v1/users/${admin.id}/status`).send({ status: "SUSPENDED" });
      expect(suspend.status).toBe(409);
      expect(suspend.body).toMatchObject({ errorCode: "SELF_ACTION_NOT_ALLOWED" });
      expect(suspend.body.message).toContain("suspend your own account");

      const remove = await as(admin).delete(`/api/v1/users/${admin.id}`);
      expect(remove.status).toBe(409);
      expect(remove.body.errorCode).toBe("SELF_ACTION_NOT_ALLOWED");
      expect(remove.body.message).toContain("remove your own account");

      const managerSelf = await as(manager).patch(`/api/v1/users/${manager.id}/status`).send({ status: "SUSPENDED" });
      expect(managerSelf.body.errorCode).toBe("SELF_ACTION_NOT_ALLOWED");
    });

    it("protects the last active Admin when two Admins act on each other at the same moment", async () => {
      const admin2 = await makeUser(t.prisma, { email: "admin2@test.dev", name: "Ben Admin", role: "ADMIN" });
      const users = t.app.get(UsersService);
      const ctx = (a: typeof admin) => ({ actor: { id: a.id, role: a.role, email: a.email, status: "ACTIVE" } });
      // Both calls pass every check made before the transaction (each actor is active, each target is not the actor).
      // Only the row lock on the active Admins stops the second from seeing a stale count.
      const results = await Promise.allSettled([users.remove(ctx(admin), admin2.id), users.remove(ctx(admin2), admin.id)]);

      expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
      const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(rejected?.reason).toMatchObject({ errorCode: "LAST_ADMIN_PROTECTED" });
      expect(await t.prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE", deletedAt: null } })).toBe(1);
    });

    it("never leaves the portal without an Admin when two Admins remove each other over HTTP", async () => {
      const admin2 = await makeUser(t.prisma, { email: "admin2@test.dev", name: "Ben Admin", role: "ADMIN" });
      const [a, b] = await Promise.all([as(admin).delete(`/api/v1/users/${admin2.id}`), as(admin2).delete(`/api/v1/users/${admin.id}`)]);
      // The loser is refused either by the last-Admin rule or because the winner already removed them.
      expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1);
      expect([a.status, b.status].filter((s) => s === 409 || s === 401)).toHaveLength(1);
      expect(await t.prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE", deletedAt: null } })).toBe(1);
    });

    it("protects the last active Admin from suspension even when the acting Admin was suspended a moment ago", async () => {
      const admin2 = await makeUser(t.prisma, { email: "admin2@test.dev", name: "Ben Admin", role: "ADMIN", status: "SUSPENDED" });
      const users = t.app.get(UsersService);
      // A request that passed the guard just before admin2 was suspended: the actor object still says ACTIVE.
      const stale = { actor: { id: admin2.id, role: "ADMIN" as const, email: admin2.email, status: "ACTIVE" } };
      await expect(users.setStatus(stale, admin.id, { status: "SUSPENDED" })).rejects.toMatchObject({ errorCode: "LAST_ADMIN_PROTECTED" });
      await expect(users.remove(stale, admin.id)).rejects.toMatchObject({ errorCode: "LAST_ADMIN_PROTECTED" });
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).status).toBe("ACTIVE");
    });

    it("lets an Admin be removed when another active Admin remains", async () => {
      const admin2 = await makeUser(t.prisma, { email: "admin2@test.dev", role: "ADMIN" });
      const res = await as(admin).delete(`/api/v1/users/${admin2.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: "REMOVED" });
      const row = await t.prisma.user.findUniqueOrThrow({ where: { id: admin2.id } });
      expect(row.deletedAt).not.toBeNull();
    });

    it("requires reassigning before removing a CSR, and says how many clients and tasks are affected", async () => {
      const c1 = await makeUser(t.prisma, { email: "client1@test.dev", name: "Client One", role: "CLIENT", csrId: csr1.id });
      await makeUser(t.prisma, { email: "client2@test.dev", name: "Client Two", role: "CLIENT", csrId: csr1.id });
      const theCase = await makeCase(t.prisma, { clientId: c1.id });
      await t.prisma.task.createMany({
        data: [1, 2, 3].map((n) => ({ caseId: theCase.id, title: `Task ${n}`, type: "CSR_FOLLOW_UP" as const, due: new Date("2027-01-01"), createdById: admin.id, assigneeId: csr1.id })),
      });
      await t.prisma.task.create({ data: { caseId: theCase.id, title: "Done one", type: "CSR_FOLLOW_UP", done: true, due: new Date("2027-01-01"), createdById: admin.id, assigneeId: csr1.id } });

      const blocked = await as(admin).delete(`/api/v1/users/${csr1.id}`);
      expect(blocked.status).toBe(409);
      expect(blocked.body.errorCode).toBe("REASSIGNMENT_REQUIRED");
      expect(blocked.body.message).toContain("2 assigned clients and 3 open tasks");
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: csr1.id } })).status).toBe("ACTIVE");

      // Clients only: the message counts just those.
      await t.prisma.task.deleteMany();
      const clientsOnly = await as(admin).delete(`/api/v1/users/${csr1.id}`);
      expect(clientsOnly.body.message).toContain("2 assigned clients.");
      expect(clientsOnly.body.message).not.toContain("task");

      // Reassign, then it goes through.
      await t.prisma.clientProfile.updateMany({ where: { csrId: csr1.id }, data: { csrId: csr2.id } });
      expect((await as(admin).delete(`/api/v1/users/${csr1.id}`)).status).toBe(200);
    });

    it("counts a single client and a single task in the singular", async () => {
      const c1 = await makeUser(t.prisma, { email: "client1@test.dev", role: "CLIENT", csrId: csr1.id });
      const theCase = await makeCase(t.prisma, { clientId: c1.id });
      await t.prisma.task.create({ data: { caseId: theCase.id, title: "One", type: "CSR_FOLLOW_UP", due: new Date("2027-01-01"), createdById: admin.id, assigneeId: csr1.id } });
      const res = await as(admin).delete(`/api/v1/users/${csr1.id}`);
      expect(res.body.message).toContain("1 assigned client and 1 open task");
    });

    it("removes a client's cases from view with them, and the removal ends their sessions", async () => {
      const c1 = await makeUser(t.prisma, { email: "client1@test.dev", role: "CLIENT", csrId: csr1.id });
      const theCase = await makeCase(t.prisma, { clientId: c1.id });
      const { cookie } = await login(t, "client1@test.dev");
      expect(cookie).toBeDefined();

      const res = await as(admin).delete(`/api/v1/users/${c1.id}`);
      expect(res.status).toBe(200);
      expect((await t.prisma.case.findUniqueOrThrow({ where: { id: theCase.id } })).deletedAt).not.toBeNull();
      expect(await t.prisma.refreshToken.count({ where: { userId: c1.id, revokedAt: null } })).toBe(0);
    });

    it("lets only Admin remove, and Manager suspend only accounts below Admin and Manager", async () => {
      const managerRemoves = await as(manager).delete(`/api/v1/users/${csr1.id}`);
      expect(managerRemoves.status).toBe(403);
      expect(managerRemoves.body.message).toContain("Only Admin can remove users");

      const managerSuspendsAdmin = await as(manager).patch(`/api/v1/users/${admin.id}/status`).send({ status: "SUSPENDED" });
      expect(managerSuspendsAdmin.status).toBe(403);
      expect(managerSuspendsAdmin.body.errorCode).toBe("PERMISSION_DENIED");
      const manager2 = await makeUser(t.prisma, { email: "manager2@test.dev", role: "MANAGER" });
      expect((await as(manager).patch(`/api/v1/users/${manager2.id}/status`).send({ status: "SUSPENDED" })).status).toBe(403);
      expect((await as(manager).patch(`/api/v1/users/${csr1.id}/status`).send({ status: "SUSPENDED" })).status).toBe(200);

      expect((await as(csr2).patch(`/api/v1/users/${compliance.id}/status`).send({ status: "SUSPENDED" })).status).toBe(403);
    });

    it("explains an impossible status change instead of silently accepting it", async () => {
      const already = await as(admin).patch(`/api/v1/users/${csr1.id}/status`).send({ status: "ACTIVE" });
      expect(already.status).toBe(409);
      expect(already.body).toMatchObject({ errorCode: "INVALID_STATE_TRANSITION" });
      expect(already.body.message).toContain("already active");

      const invited = await makeUser(t.prisma, { email: "pending@test.dev", role: "CSR", status: "INVITED", password: false });
      const suspendInvited = await as(admin).patch(`/api/v1/users/${invited.id}/status`).send({ status: "SUSPENDED" });
      expect(suspendInvited.status).toBe(409);
      expect(suspendInvited.body.message).toContain("hasn't accepted their invitation");

      const bad = await as(admin).patch(`/api/v1/users/${csr1.id}/status`).send({ status: "REMOVED" });
      expect(bad.status).toBe(422);
      expect(bad.body.errors[0].field).toBe("status");
    });

    it("treats a removed account as read-only everywhere", async () => {
      await as(admin).delete(`/api/v1/users/${csr2.id}`);
      for (const res of [
        await as(admin).patch(`/api/v1/users/${csr2.id}`).send({ name: "New Name" }),
        await as(admin).patch(`/api/v1/users/${csr2.id}/email`).send({ email: "new@test.dev" }),
        await as(admin).patch(`/api/v1/users/${csr2.id}/status`).send({ status: "SUSPENDED" }),
        await as(admin).delete(`/api/v1/users/${csr2.id}`),
        await as(admin).post(`/api/v1/users/${csr2.id}/resend-invitation`).send(),
      ]) {
        expect(res.status).toBe(409);
        expect(res.body.errorCode).toBe("USER_REMOVED");
        expect(res.body.message).toContain("Carl CSR");
      }
      // It can still be looked up.
      const found = await as(admin).get(`/api/v1/users/${csr2.id}`);
      expect(found.body.data.status).toBe("REMOVED");
    });
  });

  describe("name and email", () => {
    it("lets anyone rename themselves, and only Admin/Manager rename others", async () => {
      const own = await as(csr1).patch(`/api/v1/users/${csr1.id}`).send({ name: "  Cora Updated  " });
      expect(own.status).toBe(200);
      expect(own.body.data.name).toBe("Cora Updated");
      expect(await t.prisma.auditLog.count({ where: { action: "Updated own profile", actorId: csr1.id } })).toBe(1);

      const other = await as(csr1).patch(`/api/v1/users/${csr2.id}`).send({ name: "Hijack" });
      expect(other.status).toBe(403);
      expect(other.body.errorCode).toBe("PERMISSION_DENIED");

      const byManager = await as(manager).patch(`/api/v1/users/${csr2.id}`).send({ name: "Carl Renamed" });
      expect(byManager.status).toBe(200);
      const managerOnAdmin = await as(manager).patch(`/api/v1/users/${admin.id}`).send({ name: "Nope" });
      expect(managerOnAdmin.status).toBe(403);

      const empty = await as(csr1).patch(`/api/v1/users/${csr1.id}`).send({ name: "   " });
      expect(empty.status).toBe(422);
      expect(empty.body.errors[0]).toEqual({ field: "name", message: "Enter the full name." });
    });

    it("changes an email, notifies the person and the old address, and audits it", async () => {
      const res = await as(manager).patch(`/api/v1/users/${csr1.id}/email`).send({ email: "Cora.New@Test.dev" });
      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe("cora.new@test.dev");

      expect(await t.prisma.notification.count({ where: { userId: csr1.id, text: "Your login email was changed to cora.new@test.dev" } })).toBe(1);
      expect(t.mail.sent.find((m) => m.kind === "email-change")).toMatchObject({ to: "csr1@test.dev" });
      const audit = await t.prisma.auditLog.findFirst({ where: { action: "Changed email for Cora CSR from csr1@test.dev to cora.new@test.dev" } });
      expect(audit?.actorId).toBe(manager.id);
    });

    it("refuses a taken, unchanged or malformed email, naming it", async () => {
      const taken = await as(admin).patch(`/api/v1/users/${csr1.id}/email`).send({ email: "CSR2@test.dev" });
      expect(taken.status).toBe(409);
      expect(taken.body.errorCode).toBe("EMAIL_IN_USE");
      expect(taken.body.message).toContain("csr2@test.dev");

      const same = await as(admin).patch(`/api/v1/users/${csr1.id}/email`).send({ email: "CSR1@test.dev" });
      expect(same.status).toBe(422);
      expect(same.body.errorCode).toBe("EMAIL_UNCHANGED");

      const bad = await as(admin).patch(`/api/v1/users/${csr1.id}/email`).send({ email: "nope" });
      expect(bad.status).toBe(422);
      expect(bad.body.errors).toEqual([{ field: "email", message: "Enter a valid email address." }]);
    });

    it("follows the email rule for Managers: not Admin or other Manager accounts; CSR can't at all", async () => {
      const onAdmin = await as(manager).patch(`/api/v1/users/${admin.id}/email`).send({ email: "x@test.dev" });
      expect(onAdmin.status).toBe(403);
      expect(onAdmin.body.message).toContain("Managers can update CSR, Compliance and client emails");
      const byCsr = await as(csr1).patch(`/api/v1/users/${csr2.id}/email`).send({ email: "x@test.dev" });
      expect(byCsr.status).toBe(403);
    });

    it("replaces the invitation link when the email of someone still invited is corrected", async () => {
      const invite = await as(admin).post("/api/v1/users").send({ email: "typo@test.dev", role: "CSR" });
      const oldToken = t.mail.inviteTokenFor("typo@test.dev");
      const fix = await as(admin).patch(`/api/v1/users/${invite.body.data.id}/email`).send({ email: "fixed@test.dev" });
      expect(fix.status).toBe(200);
      const newToken = t.mail.inviteTokenFor("fixed@test.dev");
      expect(newToken).not.toBe(oldToken);
      expect((await t.http().get(`/api/v1/auth/invitations/${oldToken}`)).status).toBe(410);
      expect((await t.http().get(`/api/v1/auth/invitations/${newToken}`)).body.data.email).toBe("fixed@test.dev");
    });
  });

  describe("list and get", () => {
    it("lists with search, role and status filters and pagination meta", async () => {
      await makeUser(t.prisma, { email: "pending@test.dev", name: "Pat Pending", role: "CSR", status: "INVITED", password: false });
      const all = await as(admin).get("/api/v1/users?limit=3&page=1&sort=email&order=asc");
      expect(all.status).toBe(200);
      expect(all.body.meta).toEqual({ page: 1, limit: 3, total: 6, totalPages: 2 });
      expect(all.body.data.map((u: { email: string }) => u.email)).toEqual(["admin@test.dev", "comp@test.dev", "csr1@test.dev"]);
      expect(all.body.data[0].passwordHash).toBeUndefined();

      const page2 = await as(admin).get("/api/v1/users?limit=3&page=2&sort=email&order=asc");
      expect(page2.body.data).toHaveLength(3);

      const csrs = await as(manager).get("/api/v1/users?role=CSR&sort=name");
      expect(csrs.body.data.map((u: { name: string }) => u.name)).toEqual(["Carl CSR", "Cora CSR", "Pat Pending"]);
      const invited = await as(admin).get("/api/v1/users?status=INVITED");
      expect(invited.body.data.map((u: { email: string }) => u.email)).toEqual(["pending@test.dev"]);
      const search = await as(admin).get("/api/v1/users?search=CLEO");
      expect(search.body.data.map((u: { name: string }) => u.name)).toEqual(["Cleo Compliance"]);
      const byEmail = await as(admin).get("/api/v1/users?search=csr2%40");
      expect(byEmail.body.data).toHaveLength(1);
    });

    it("hides removed accounts unless they are asked for by status", async () => {
      await as(admin).delete(`/api/v1/users/${csr2.id}`);
      const normal = await as(admin).get("/api/v1/users?role=CSR");
      expect(normal.body.data.map((u: { email: string }) => u.email)).toEqual(["csr1@test.dev"]);
      const removed = await as(admin).get("/api/v1/users?status=REMOVED");
      expect(removed.body.data.map((u: { email: string }) => u.email)).toEqual(["csr2@test.dev"]);
    });

    it("rejects a page below 1 and a limit above 100 with a message on the field", async () => {
      const page = await as(admin).get("/api/v1/users?page=0");
      expect(page.status).toBe(422);
      expect(page.body.errorCode).toBe("VALIDATION_FAILED");
      expect(page.body.errors).toEqual([{ field: "page", message: "page must be 1 or greater." }]);

      const limit = await as(admin).get("/api/v1/users?limit=101");
      expect(limit.status).toBe(422);
      expect(limit.body.errors).toEqual([{ field: "limit", message: "limit can't be more than 100. Ask for a smaller page." }]);

      const both = await as(admin).get("/api/v1/users?page=-1&limit=1000&order=up");
      expect(both.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["limit", "order", "page"]);

      const sort = await as(admin).get("/api/v1/users?sort=passwordHash");
      expect(sort.status).toBe(422);
      expect(sort.body.errors[0].field).toBe("sort");
    });

    it("keeps the list and single account to Admin and Manager", async () => {
      for (const who of [csr1, compliance]) {
        expect((await as(who).get("/api/v1/users")).status).toBe(403);
        expect((await as(who).get(`/api/v1/users/${admin.id}`)).status).toBe(403);
      }
      expect((await api(t).get("/api/v1/users")).status).toBe(401);
      const one = await as(manager).get(`/api/v1/users/${csr1.id}`);
      expect(one.status).toBe(200);
      expect(one.body.data).toMatchObject({ email: "csr1@test.dev", role: "CSR" });
      const missing = await as(admin).get("/api/v1/users/does-not-exist");
      expect(missing.status).toBe(404);
      expect(missing.body.errorCode).toBe("RESOURCE_NOT_FOUND");
    });
  });

  describe("notification preferences", () => {
    it("returns every category on by default, changes only what is sent, and audits it", async () => {
      const before = await as(csr1).get("/api/v1/users/me/notification-preferences");
      expect(before.status).toBe(200);
      expect(before.body.data).toHaveLength(5);
      expect(before.body.data.every((p: { email: boolean; inApp: boolean }) => p.email && p.inApp)).toBe(true);

      const res = await as(csr1)
        .patch("/api/v1/users/me/notification-preferences")
        .send({ preferences: [{ category: "STAGE", email: false }, { category: "TICKETS", inApp: false, email: false }] });
      expect(res.status).toBe(200);
      const byCategory = Object.fromEntries(res.body.data.map((p: { category: string }) => [p.category, p]));
      expect(byCategory.STAGE).toMatchObject({ email: false, inApp: true });
      expect(byCategory.TICKETS).toMatchObject({ email: false, inApp: false });
      expect(byCategory.MESSAGES).toMatchObject({ email: true, inApp: true });

      const again = await as(csr1).get("/api/v1/users/me/notification-preferences");
      expect(Object.fromEntries(again.body.data.map((p: { category: string }) => [p.category, p])).STAGE.email).toBe(false);
      expect(await t.prisma.auditLog.count({ where: { actorId: csr1.id, action: { startsWith: "Updated own notification preferences" } } })).toBe(1);
      // Someone else's preferences are untouched.
      expect((await as(csr2).get("/api/v1/users/me/notification-preferences")).body.data.every((p: { email: boolean }) => p.email)).toBe(true);
    });

    it("rejects an empty change, a repeated category and an unknown one with a message on the field", async () => {
      const empty = await as(csr1).patch("/api/v1/users/me/notification-preferences").send({ preferences: [] });
      expect(empty.status).toBe(422);
      expect(empty.body.errors[0].field).toBe("preferences");

      const noop = await as(csr1).patch("/api/v1/users/me/notification-preferences").send({ preferences: [{ category: "STAGE" }] });
      expect(noop.status).toBe(422);
      expect(noop.body.errors[0].message).toContain("STAGE");

      const dup = await as(csr1)
        .patch("/api/v1/users/me/notification-preferences")
        .send({ preferences: [{ category: "STAGE", email: true }, { category: "STAGE", email: false }] });
      expect(dup.status).toBe(422);
      expect(dup.body.errors[0]).toEqual({ field: "preferences.1.category", message: "STAGE is listed more than once." });

      const unknown = await as(csr1).patch("/api/v1/users/me/notification-preferences").send({ preferences: [{ category: "GOSSIP", email: true }] });
      expect(unknown.status).toBe(422);
    });
  });
});
