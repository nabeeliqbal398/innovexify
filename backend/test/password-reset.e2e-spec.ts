import { createHash } from "node:crypto";

import { createAppWithMail, freshIp, login, makeUser, PASSWORD, refreshCookie, resetDatabase, withCookie, type TestApp } from "./helpers";
import type { RecordingMail } from "./helpers";
import { PasswordResetService } from "../src/modules/auth/service/password-reset.service";

const NEW_PASSWORD = "Brand-New-Passw0rd!";
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const SAME_MESSAGE = "If an account exists for that email, we've sent a link to reset the password.";

describe("password reset (e2e)", () => {
  let t: TestApp & { mail: RecordingMail };

  beforeAll(async () => {
    t = await createAppWithMail();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    t.mail.sent = [];
    await makeUser(t.prisma, { email: "csr@test.dev", name: "Casey CSR", role: "CSR" });
    await makeUser(t.prisma, { email: "suspended@test.dev", role: "CSR", status: "SUSPENDED" });
    await makeUser(t.prisma, { email: "invited@test.dev", role: "CSR", status: "INVITED", password: false });
  });

  const idle = (): Promise<void> => t.app.get(PasswordResetService).idle();
  const forgot = (email: string, ip = freshIp()) => t.http().post("/api/v1/auth/forgot-password").set("X-Forwarded-For", ip).send({ email });
  const reset = (token: string, password = NEW_PASSWORD) => t.http().post("/api/v1/auth/reset-password").set("X-Forwarded-For", freshIp()).send({ token, password });
  const lookup = (token: string) => t.http().get(`/api/v1/auth/reset-password/${token}`).set("X-Forwarded-For", freshIp());
  /** Ask for a link as the account holder and return the raw token from the email. */
  async function requestToken(email = "csr@test.dev"): Promise<string> {
    expect((await forgot(email)).status).toBe(200);
    await idle();
    return t.mail.resetTokenFor(email);
  }

  describe("asking for a link", () => {
    it("emails a single-use link to an active account and stores only its hash", async () => {
      const res = await forgot("csr@test.dev");
      expect(res.status).toBe(200);
      await idle();

      expect(t.mail.sent).toHaveLength(1);
      expect(t.mail.sent[0]).toMatchObject({ to: "csr@test.dev", kind: "password-reset" });
      expect(t.mail.sent[0].text).toContain("expires in 30 minutes");
      const token = t.mail.resetTokenFor("csr@test.dev");
      expect(token.length).toBeGreaterThanOrEqual(48);

      const rows = await t.prisma.passwordResetToken.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash).toBe(sha256(token));
      expect(JSON.stringify(rows)).not.toContain(token);
      const minutes = (rows[0].expiresAt.getTime() - rows[0].createdAt.getTime()) / 60_000;
      expect(minutes).toBeGreaterThan(29.9);
      expect(minutes).toBeLessThan(30.1);
    });

    it("answers identically for a real account, an unknown email, a suspended account and one that has not accepted its invitation", async () => {
      const answers = [];
      for (const email of ["csr@test.dev", "nobody@test.dev", "suspended@test.dev", "invited@test.dev"]) {
        const res = await forgot(email);
        answers.push({ email, status: res.status, body: res.body.data, message: res.body.message, success: res.body.success, headers: Object.keys(res.headers).filter((h) => /cookie|location/i.test(h)) });
      }
      for (const a of answers) {
        expect({ ...a, email: "x" }).toEqual({ email: "x", status: 200, body: null, message: SAME_MESSAGE, success: true, headers: [] });
      }
      await idle();
      expect(t.mail.sent.map((m) => m.to)).toEqual(["csr@test.dev"]);
    });

    it("sends nothing and makes no token for a suspended, removed or still-invited account, and says so in the audit log", async () => {
      await makeUser(t.prisma, { email: "removed@test.dev", role: "CSR", status: "REMOVED" });
      for (const email of ["suspended@test.dev", "removed@test.dev", "invited@test.dev", "nobody@test.dev"]) expect((await forgot(email)).status).toBe(200);
      await idle();
      expect(t.mail.sent).toHaveLength(0);
      expect(await t.prisma.passwordResetToken.count()).toBe(0);
      const refused = await t.prisma.auditLog.count({ where: { action: { startsWith: "Refused: password reset requested" }, ok: false } });
      expect(refused).toBe(4);
    });

    it("does the same work for an unknown email as for a real one: a token is generated and the audit log is written either way", async () => {
      await forgot("csr@test.dev");
      await forgot("nobody@test.dev");
      const entries = await t.prisma.auditLog.findMany({ where: { category: "auth" }, orderBy: { createdAt: "asc" } });
      expect(entries.map((e) => e.action.startsWith("Password reset requested") || e.action.startsWith("Refused: password reset requested"))).toEqual([true, true]);
    });

    it("rejects a malformed email by field, which reveals nothing about any account", async () => {
      const res = await forgot("not-an-email");
      expect(res.status).toBe(422);
      expect(res.body.errors[0].field).toBe("email");
    });

    it("throttles per address and email: the sixth request for one email is refused, another email from the same address is not", async () => {
      const ip = "203.0.113.20";
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) statuses.push((await forgot("csr@test.dev", ip)).status);
      expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
      expect((await forgot("nobody@test.dev", ip)).status).toBe(200);
      // Unknown and known emails are throttled alike.
      const unknown: number[] = [];
      for (let i = 0; i < 6; i++) unknown.push((await forgot("ghost@test.dev", "203.0.113.21")).status);
      expect(unknown).toEqual([200, 200, 200, 200, 200, 429]);
    });

    it("sends one email, not one per click: asking again within a minute adds nothing", async () => {
      await forgot("csr@test.dev");
      await forgot("csr@test.dev");
      await idle();
      expect(t.mail.sent).toHaveLength(1);
      expect(await t.prisma.passwordResetToken.count()).toBe(1);
    });

    it("a newer link retires the older one", async () => {
      const first = await requestToken();
      await t.prisma.passwordResetToken.updateMany({ data: { createdAt: new Date(Date.now() - 5 * 60_000) } });
      const second = await requestToken();
      expect(second).not.toBe(first);
      expect((await reset(first)).body.errorCode).toBe("PASSWORD_RESET_USED");
      expect((await reset(second)).status).toBe(200);
    });

    it("still answers the same when the mail server is down (the account is not revealed by an error)", async () => {
      t.mail.failWith = new Error("SMTP unreachable");
      try {
        const res = await forgot("csr@test.dev");
        expect(res.status).toBe(200);
        expect(res.body.message).toBe(SAME_MESSAGE);
        await idle();
      } finally {
        t.mail.failWith = null;
      }
    });
  });

  describe("choosing a new password", () => {
    it("sets the password, signs the person out everywhere, writes an audit entry and sends the security email", async () => {
      const user = (await t.prisma.user.findFirstOrThrow({ where: { email: "csr@test.dev" } }));
      const a = await login(t, "csr@test.dev");
      const b = await login(t, "csr@test.dev");
      expect((await t.http().post("/api/v1/auth/refresh").set("X-Forwarded-For", freshIp()).set("Cookie", withCookie(a.cookie!)).send({})).status).toBe(200);
      // a failed-login counter and lock from before are cleared too
      await t.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 3, lockedUntil: new Date(Date.now() + 600_000) } });

      const token = await requestToken();
      t.mail.sent = [];
      const res = await reset(token);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Password changed. Sign in with your new password.");
      expect(res.body.data).toEqual({ sessionsEnded: 2 });
      expect(refreshCookie(res)).toBeUndefined(); // no session is opened: sign in with the new password

      // every refresh-token family is revoked
      const open = await t.prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
      expect(open).toBe(0);
      for (const cookie of [a.cookie, b.cookie]) {
        const refreshed = await t.http().post("/api/v1/auth/refresh").set("X-Forwarded-For", freshIp()).set("Cookie", withCookie(cookie!)).send({});
        expect(refreshed.status).toBe(401);
      }

      expect((await login(t, "csr@test.dev", PASSWORD)).res.status).toBe(401);
      const fresh = await login(t, "csr@test.dev", NEW_PASSWORD);
      expect(fresh.res.status).toBe(200);
      const after = await t.prisma.user.findFirstOrThrow({ where: { id: user.id } });
      expect(after.failedLoginCount).toBe(0);
      expect(after.lockedUntil).toBeNull();
      expect(after.passwordHash).not.toBe(user.passwordHash);

      const audit = await t.prisma.auditLog.findFirst({ where: { action: { startsWith: "Password reset completed" } } });
      expect(audit).toMatchObject({ actorId: user.id, ok: true, category: "auth", target: "csr@test.dev", action: "Password reset completed; 2 sessions ended" });

      expect(t.mail.sent).toHaveLength(1);
      expect(t.mail.sent[0]).toMatchObject({ to: "csr@test.dev", kind: "password-changed" });
      expect(t.mail.sent[0].subject).toContain("password was changed");
      expect(JSON.stringify(t.mail.sent[0])).not.toContain(NEW_PASSWORD);
    });

    it("sends the security email even when every notification is switched off", async () => {
      await t.prisma.notificationTrigger.updateMany({ data: { enabled: false } });
      const token = await requestToken();
      t.mail.sent = [];
      expect((await reset(token)).status).toBe(200);
      expect(t.mail.sent.map((m) => m.kind)).toEqual(["password-changed"]);
    });

    it("the reset still succeeds when the security email cannot be sent", async () => {
      const token = await requestToken();
      t.mail.failWith = new Error("SMTP unreachable");
      try {
        expect((await reset(token)).status).toBe(200);
      } finally {
        t.mail.failWith = null;
      }
      expect((await login(t, "csr@test.dev", NEW_PASSWORD)).res.status).toBe(200);
    });

    it("works once: reusing the link says it was already used, and the password stays as chosen", async () => {
      const token = await requestToken();
      expect((await reset(token)).status).toBe(200);
      const again = await reset(token, "Another-Passw0rd-9");
      expect(again.status).toBe(409);
      expect(again.body.errorCode).toBe("PASSWORD_RESET_USED");
      expect((await login(t, "csr@test.dev", NEW_PASSWORD)).res.status).toBe(200);
      expect((await login(t, "csr@test.dev", "Another-Passw0rd-9")).res.status).toBe(401);
    });

    it("lets exactly one of two simultaneous submissions win", async () => {
      const token = await requestToken();
      const [x, y] = await Promise.all([reset(token, "First-Passw0rd-123"), reset(token, "Second-Passw0rd-456")]);
      expect([x.status, y.status].sort()).toEqual([200, 409]);
      const winner = x.status === 200 ? "First-Passw0rd-123" : "Second-Passw0rd-456";
      expect((await login(t, "csr@test.dev", winner)).res.status).toBe(200);
    });

    it("says the link has expired after 30 minutes", async () => {
      const token = await requestToken();
      await t.prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      const res = await reset(token);
      expect(res.status).toBe(410);
      expect(res.body.errorCode).toBe("PASSWORD_RESET_EXPIRED");
      expect((await login(t, "csr@test.dev", PASSWORD)).res.status).toBe(200); // unchanged
    });

    it("says an unknown or altered link is not valid", async () => {
      const token = await requestToken();
      for (const bad of ["x".repeat(48), `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`]) {
        const res = await reset(bad);
        expect(res.status).toBe(404);
        expect(res.body.errorCode).toBe("PASSWORD_RESET_INVALID");
      }
      const short = await reset("short");
      expect(short.status).toBe(422);
    });

    it("refuses a weak password by field and keeps the link usable", async () => {
      const token = await requestToken();
      const weak = await reset(token, "short");
      expect(weak.status).toBe(422);
      expect(weak.body.errors[0]).toMatchObject({ field: "password", message: "Use 12 to 128 characters with upper and lower case letters and at least one number." });
      expect((await reset(token)).status).toBe(200);
    });

    it("refuses a reset once the account has been suspended, and tells nobody why", async () => {
      const token = await requestToken();
      await t.prisma.user.updateMany({ where: { email: "csr@test.dev" }, data: { status: "SUSPENDED" } });
      const res = await reset(token);
      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe("PASSWORD_RESET_INVALID");
      expect((await lookup(token)).body.errorCode).toBe("PASSWORD_RESET_INVALID");
      await t.prisma.user.updateMany({ where: { email: "csr@test.dev" }, data: { status: "ACTIVE" } });
      expect((await login(t, "csr@test.dev", PASSWORD)).res.status).toBe(200); // the password never changed
    });

    it("refuses a reset once the account has been removed", async () => {
      const token = await requestToken();
      await t.prisma.user.updateMany({ where: { email: "csr@test.dev" }, data: { status: "REMOVED", deletedAt: new Date() } });
      expect((await reset(token)).body.errorCode).toBe("PASSWORD_RESET_INVALID");
    });

    it("rolls everything back if the account is suspended in the middle of the reset", async () => {
      await requestToken();
      const user = await t.prisma.user.findFirstOrThrow({ where: { email: "csr@test.dev" } });
      const hash = user.passwordHash;
      const record = await t.prisma.passwordResetToken.findFirstOrThrow();
      await t.prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
      const outcome = await (t.app.get(PasswordResetService) as unknown as { repo: { completePasswordReset: (a: string, b: string, c: string) => Promise<unknown> } }).repo.completePasswordReset(record.id, user.id, "new-hash");
      expect(outcome).toBe("inactive");
      const after = await t.prisma.user.findFirstOrThrow({ where: { id: user.id } });
      expect(after.passwordHash).toBe(hash);
      expect((await t.prisma.passwordResetToken.findFirstOrThrow()).usedAt).toBeNull(); // the burn was rolled back too
    });
  });

  describe("checking a link first", () => {
    it("accepts a fresh link, and tells expired, used and unknown links apart", async () => {
      const token = await requestToken();
      const ok = await lookup(token);
      expect(ok.status).toBe(200);
      expect(Object.keys(ok.body.data)).toEqual(["expiresAt"]); // no email or name leaves with it
      expect((await lookup("x".repeat(48))).body.errorCode).toBe("PASSWORD_RESET_INVALID");

      await t.prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await lookup(token)).body.errorCode).toBe("PASSWORD_RESET_EXPIRED");
      await t.prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() + 60_000), usedAt: new Date() } });
      expect((await lookup(token)).body.errorCode).toBe("PASSWORD_RESET_USED");
    });
  });

  it("is not reachable with a refresh cookie or bearer token as a shortcut: the endpoints are public but need the token", async () => {
    const res = await t.http().post("/api/v1/auth/reset-password").set("X-Forwarded-For", freshIp()).send({ password: NEW_PASSWORD });
    expect(res.status).toBe(422);
  });
});
