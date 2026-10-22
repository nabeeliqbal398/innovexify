import { createHash, randomBytes } from "node:crypto";

import {
  createApp,
  freshIp,
  login,
  makeUser,
  PASSWORD,
  refreshCookie,
  resetDatabase,
  withCookie,
  type TestApp,
} from "./helpers";

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

describe("auth (e2e)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createApp();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await makeUser(t.prisma, { email: "admin@test.dev", role: "ADMIN" });
    await makeUser(t.prisma, { email: "csr@test.dev", role: "CSR" });
  });

  const refresh = (cookie: string) => t.http().post("/api/v1/auth/refresh").set("X-Forwarded-For", freshIp()).set("Cookie", withCookie(cookie)).send({});

  describe("login", () => {
    it("signs in, returns the standard envelope and the user", async () => {
      const { res } = await login(t, "admin@test.dev");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        statusCode: 200,
        message: "Signed in.",
        path: "/api/v1/auth/login",
        data: { user: { email: "admin@test.dev", role: "ADMIN", status: "ACTIVE" }, expiresIn: 900 },
      });
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(new Date(res.body.timestamp).toString()).not.toBe("Invalid Date");
      expect(res.headers["x-request-id"]).toEqual(expect.any(String));
    });

    it("accepts a differently-cased email", async () => {
      const { res } = await login(t, "ADMIN@Test.Dev");
      expect(res.status).toBe(200);
    });

    it("gives the same specific message for a wrong password and an unknown email", async () => {
      const wrong = await login(t, "admin@test.dev", "Not-The-Password-1");
      const unknown = await login(t, "nobody@test.dev");
      for (const res of [wrong.res, unknown.res]) {
        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({
          success: false,
          statusCode: 401,
          errorCode: "INVALID_CREDENTIALS",
          message: "That email and password don't match. Check both and try again.",
        });
        expect(res.body.stack).toBeUndefined();
      }
    });

    it("reports each bad field in a DTO error", async () => {
      const res = await t.http().post("/api/v1/auth/login").set("X-Forwarded-For", freshIp()).send({ email: "not-an-email", password: "", extra: true });
      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe("VALIDATION_FAILED");
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          { field: "email", message: "Enter a valid email address." },
          { field: "password", message: "Enter your password." },
          { field: "extra", message: "property extra should not exist" },
        ]),
      );
    });

    it("blocks a suspended user with a clear message", async () => {
      await makeUser(t.prisma, { email: "suspended@test.dev", role: "CSR", status: "SUSPENDED" });
      const { res } = await login(t, "suspended@test.dev");
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe("ACCOUNT_INACTIVE");
      expect(res.body.message).toMatch(/suspended/i);
    });
  });

  describe("refresh tokens", () => {
    it("sets the refresh token as an httpOnly cookie and keeps it out of the JSON body", async () => {
      const { res, cookie } = await login(t, "admin@test.dev");
      expect(cookie).toBeDefined();
      expect(cookie?.raw).toMatch(/HttpOnly/i);
      expect(cookie?.raw).toMatch(/SameSite=Strict/i);
      expect(cookie?.raw).toMatch(/Path=\/api\/v1\/auth/);
      expect(cookie?.raw).not.toMatch(/Secure/i); // only in production; see the production test below
      expect(res.body.data.refreshToken).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain(cookie?.value);
    });

    it("rotates: each refresh returns a new token and the old one stops working", async () => {
      const first = (await login(t, "admin@test.dev")).cookie;
      const res = await refresh(first?.value ?? "");
      expect(res.status).toBe(200);
      const second = refreshCookie(res);
      expect(second?.value).toBeDefined();
      expect(second?.value).not.toBe(first?.value);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
    });

    it("revokes the whole family when a rotated token is used again", async () => {
      const first = (await login(t, "admin@test.dev")).cookie;
      const rotated = await refresh(first?.value ?? "");
      const second = refreshCookie(rotated);

      const replay = await refresh(first?.value ?? "");
      expect(replay.status).toBe(401);
      expect(replay.body.errorCode).toBe("TOKEN_REUSE_DETECTED");

      // The legitimate holder of the newest token is cut off too: the family is gone.
      const after = await refresh(second?.value ?? "");
      expect(after.status).toBe(401);
      expect(after.body.errorCode).toBe("TOKEN_INVALID");

      const audit = await t.prisma.auditLog.findFirst({ where: { action: { contains: "reuse detected" } } });
      expect(audit).toMatchObject({ ok: false, category: "auth" });
    });

    it("after logout, refreshing says the token is invalid, not reused", async () => {
      const cookie = (await login(t, "admin@test.dev")).cookie;
      const out = await t.http().post("/api/v1/auth/logout").set("X-Forwarded-For", freshIp()).set("Cookie", withCookie(cookie ?? "")).send({});
      expect(out.status).toBe(200);
      expect(([] as string[]).concat(out.headers["set-cookie"] ?? []).join(";")).toMatch(/refresh_token=;/);

      const res = await refresh(cookie?.value ?? "");
      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe("TOKEN_INVALID");
      expect(res.body.errorCode).not.toBe("TOKEN_REUSE_DETECTED");
    });

    it("needs a token: a request with no cookie is told to sign in", async () => {
      const res = await t.http().post("/api/v1/auth/refresh").set("X-Forwarded-For", freshIp()).send({});
      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe("UNAUTHENTICATED");
    });

    it("ignores a refresh token in the body unless ALLOW_BODY_REFRESH is on", async () => {
      const cookie = (await login(t, "admin@test.dev")).cookie;
      const res = await t.http().post("/api/v1/auth/refresh").set("X-Forwarded-For", freshIp()).send({ refreshToken: cookie?.value });
      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe("UNAUTHENTICATED");
    });

    it("blocks refresh, and the old access token, once the user is suspended", async () => {
      const { cookie, accessToken } = await login(t, "csr@test.dev");
      await t.prisma.user.updateMany({ where: { email: "csr@test.dev" }, data: { status: "SUSPENDED" } });

      const res = await refresh(cookie?.value ?? "");
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe("ACCOUNT_INACTIVE");

      const me = await t.http().get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);
      expect(me.status).toBe(403);
      expect(me.body.errorCode).toBe("ACCOUNT_INACTIVE");
    });
  });

  describe("sessions", () => {
    it("returns the signed-in user from /auth/me and refuses requests without a token", async () => {
      const { accessToken } = await login(t, "admin@test.dev");
      const me = await t.http().get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.data).toMatchObject({ email: "admin@test.dev", role: "ADMIN" });

      const anonymous = await t.http().get("/api/v1/auth/me");
      expect(anonymous.status).toBe(401);
      expect(anonymous.body.errorCode).toBe("UNAUTHENTICATED");

      const forged = await t.http().get("/api/v1/auth/me").set("Authorization", "Bearer not.a.token");
      expect(forged.status).toBe(401);
      expect(forged.body.errorCode).toBe("TOKEN_INVALID");
    });

    it("logout-all ends every session", async () => {
      const a = await login(t, "admin@test.dev");
      const b = await login(t, "admin@test.dev");
      const res = await t.http().post("/api/v1/auth/logout-all").set("Authorization", `Bearer ${a.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.sessionsEnded).toBe(2);
      expect((await refresh(b.cookie?.value ?? "")).body.errorCode).toBe("TOKEN_INVALID");
    });
  });

  describe("lockout", () => {
    it("locks the account after 5 wrong passwords, even for the right one, and says for how long", async () => {
      for (let i = 0; i < 5; i++) {
        const { res } = await login(t, "csr@test.dev", "Wrong-Password-1");
        expect(res.status).toBe(401);
      }
      const { res } = await login(t, "csr@test.dev");
      expect(res.status).toBe(429);
      expect(res.body.errorCode).toBe("ACCOUNT_LOCKED");
      expect(res.body.message).toBe("Too many failed sign-in attempts. Try again in 15 minutes, or reset your password.");

      const locked = await t.prisma.user.findFirst({ where: { email: "csr@test.dev" } });
      expect(locked?.lockedUntil).not.toBeNull();
      const audit = await t.prisma.auditLog.findFirst({ where: { action: { startsWith: "Account locked" } } });
      expect(audit?.ok).toBe(false);
    });

    it("a successful sign-in resets the failure count", async () => {
      for (let i = 0; i < 3; i++) await login(t, "csr@test.dev", "Wrong-Password-1");
      expect((await login(t, "csr@test.dev")).res.status).toBe(200);
      const user = await t.prisma.user.findFirst({ where: { email: "csr@test.dev" } });
      expect(user?.failedLoginCount).toBe(0);
    });
  });

  describe("invitations", () => {
    const invite = async (opts: { offsetMs?: number; usedAt?: Date | null; status?: "INVITED" | "ACTIVE" } = {}) => {
      const user = await makeUser(t.prisma, { email: `${randomBytes(4).toString("hex")}@invite.test`, role: "CLIENT", status: opts.status ?? "INVITED", password: false });
      const token = randomBytes(48).toString("base64url");
      await t.prisma.invitationToken.create({
        data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + (opts.offsetMs ?? 86_400_000)), usedAt: opts.usedAt ?? null },
      });
      return { user, token };
    };
    const lookup = (token: string) => t.http().get(`/api/v1/auth/invitations/${token}`).set("X-Forwarded-For", freshIp());
    const accept = (token: string, password: string) =>
      t.http().post("/api/v1/auth/accept-invitation").set("X-Forwarded-For", freshIp()).send({ token, password });

    it("looks up a valid invitation", async () => {
      const { token, user } = await invite();
      const res = await lookup(token);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ email: user.email, role: "CLIENT" });
    });

    it("rejects an expired invitation with 410 and an actionable message", async () => {
      const { token } = await invite({ offsetMs: -1000 });
      const res = await lookup(token);
      expect(res.status).toBe(410);
      expect(res.body).toMatchObject({ errorCode: "INVITATION_EXPIRED", message: "This invitation has expired. Ask the person who invited you to send a new one." });
    });

    it("rejects a used invitation with 409", async () => {
      const { token } = await invite({ usedAt: new Date() });
      const res = await lookup(token);
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe("INVITATION_USED");
    });

    it("rejects an unknown token with 404", async () => {
      const res = await lookup(randomBytes(48).toString("base64url"));
      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe("INVITATION_INVALID");
    });

    it("accepts a valid invitation: sets the password, activates the account, signs in, and works only once", async () => {
      const { token, user } = await invite();
      const res = await accept(token, "Brand-New-Pass-7x");
      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({ id: user.id, status: "ACTIVE" });
      expect(refreshCookie(res)).toBeDefined();

      const again = await accept(token, "Brand-New-Pass-7x");
      expect(again.status).toBe(409);
      expect(again.body.errorCode).toBe("INVITATION_USED");

      expect((await login(t, user.email, "Brand-New-Pass-7x")).res.status).toBe(200);
    });

    it("rejects a weak password with a per-field message and keeps the invitation usable", async () => {
      const { token } = await invite();
      const res = await accept(token, "weak");
      expect(res.status).toBe(422);
      expect(res.body.errors).toEqual([
        { field: "password", message: "Use 12 to 128 characters with upper and lower case letters and at least one number." },
      ]);
      expect((await lookup(token)).status).toBe(200);
    });

    it("rejects accepting an expired invitation", async () => {
      const { token } = await invite({ offsetMs: -1000 });
      const res = await accept(token, "Brand-New-Pass-7x");
      expect(res.status).toBe(410);
    });
  });

  describe("change-password", () => {
    const NEW_PASSWORD = "Another-Strong-Pass-3";
    const change = (accessToken: string | undefined, body: Record<string, unknown>) =>
      t.http().post("/api/v1/auth/change-password").set("X-Forwarded-For", freshIp()).set("Authorization", `Bearer ${accessToken}`).send(body);

    it("changes the password, keeps this session and ends the others", async () => {
      const here = await login(t, "admin@test.dev");
      const elsewhere = await login(t, "admin@test.dev");

      const res = await change(here.accessToken, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.otherSessionsEnded).toBe(1);

      expect((await refresh(here.cookie?.value ?? "")).status).toBe(200);
      expect((await refresh(elsewhere.cookie?.value ?? "")).body.errorCode).toBe("TOKEN_INVALID");

      expect((await login(t, "admin@test.dev", PASSWORD)).res.status).toBe(401);
      expect((await login(t, "admin@test.dev", NEW_PASSWORD)).res.status).toBe(200);

      const audit = await t.prisma.auditLog.findFirst({ where: { action: { startsWith: "Password changed" } } });
      expect(audit).toMatchObject({ ok: true, category: "auth" });
      expect(audit?.action).toBe("Password changed; 1 other session ended");
    });

    it("says the current password is wrong, by field", async () => {
      const { accessToken } = await login(t, "admin@test.dev");
      const res = await change(accessToken, { currentPassword: "Not-My-Password-1", newPassword: NEW_PASSWORD });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        errorCode: "CURRENT_PASSWORD_INCORRECT",
        message: "The current password you entered is incorrect.",
        errors: [{ field: "currentPassword", message: "That isn't your current password." }],
      });
    });

    it("counts wrong current passwords toward the lockout", async () => {
      const { accessToken } = await login(t, "admin@test.dev");
      for (let i = 0; i < 5; i++) {
        expect((await change(accessToken, { currentPassword: "Not-My-Password-1", newPassword: NEW_PASSWORD })).status).toBe(400);
      }
      const res = await change(accessToken, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(429);
      expect(res.body.errorCode).toBe("ACCOUNT_LOCKED");
      expect((await login(t, "admin@test.dev")).res.status).toBe(429);
    });

    it("requires the new password to differ from the current one", async () => {
      const { accessToken } = await login(t, "admin@test.dev");
      const res = await change(accessToken, { currentPassword: PASSWORD, newPassword: PASSWORD });
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ errorCode: "PASSWORD_UNCHANGED", message: "The new password must be different from your current one." });
    });

    it("applies the same strength rules as sign-up, with a per-field message", async () => {
      const { accessToken } = await login(t, "admin@test.dev");
      const res = await change(accessToken, { currentPassword: PASSWORD, newPassword: "short" });
      expect(res.status).toBe(422);
      expect(res.body.errors).toEqual([
        { field: "newPassword", message: "Use 12 to 128 characters with upper and lower case letters and at least one number." },
      ]);
    });

    it("needs a signed-in user", async () => {
      const res = await t.http().post("/api/v1/auth/change-password").set("X-Forwarded-For", freshIp()).send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(401);
    });
  });
});
