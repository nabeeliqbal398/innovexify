import { createApp, freshIp, login, makeUser, refreshCookie, resetDatabase, withCookie, type TestApp } from "./helpers";
import { REASON } from "../src/common/permissions/permissions";

describe("platform (e2e)", () => {
  describe("error handling and permissions", () => {
    let t: TestApp;
    let csr1Id: string;
    let clientId: string;
    let otherClientId: string;

    beforeAll(async () => {
      t = await createApp();
    });
    afterAll(async () => {
      await t.close();
    });
    beforeEach(async () => {
      await resetDatabase(t.prisma);
      await makeUser(t.prisma, { email: "admin@test.dev", role: "ADMIN" });
      csr1Id = (await makeUser(t.prisma, { email: "csr1@test.dev", role: "CSR" })).id;
      const csr2 = await makeUser(t.prisma, { email: "csr2@test.dev", role: "CSR" });
      clientId = (await makeUser(t.prisma, { email: "client1@test.dev", role: "CLIENT", csrId: csr1Id })).id;
      otherClientId = (await makeUser(t.prisma, { email: "client2@test.dev", role: "CLIENT", csrId: csr2.id })).id;
    });

    it("turns a Prisma P2002 into a friendly duplicate message that names the field", async () => {
      const { accessToken } = await login(t, "admin@test.dev");
      const res = await t.http().post("/api/v1/probe/users").set("Authorization", `Bearer ${accessToken}`).send({ email: "csr1@test.dev" });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        success: false,
        statusCode: 409,
        errorCode: "DUPLICATE_RESOURCE",
        message: "A user with this email already exists. Use a different email, or open the existing user.",
        errors: [{ field: "email", message: "This email is already in use." }],
      });
      expect(JSON.stringify(res.body)).not.toMatch(/prisma|stack|P2002/i);
    });

    it("answers an unknown route with the standard error shape and no internals", async () => {
      const res = await t.http().get("/api/v1/does-not-exist");
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ success: false, statusCode: 404, errorCode: "RESOURCE_NOT_FOUND", path: "/api/v1/does-not-exist" });
      expect(res.body.requestId).toEqual(expect.any(String));
    });

    it("echoes a caller's x-request-id and generates one otherwise", async () => {
      const mine = await t.http().get("/api/health").set("x-request-id", "trace-abc-12345");
      expect(mine.headers["x-request-id"]).toBe("trace-abc-12345");
      const generated = await t.http().get("/api/health");
      expect(generated.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("serves /api/health without a session", async () => {
      const res = await t.http().get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ status: "ok", database: "up" });
    });

    it("refuses a role without the permission, with the rule's reason, and audits it as ok=false", async () => {
      const { accessToken } = await login(t, "csr1@test.dev");
      const res = await t.http().get("/api/v1/probe/remove-user").set("Authorization", `Bearer ${accessToken}`);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ errorCode: "PERMISSION_DENIED", message: REASON.removeUser });

      const row = await t.prisma.auditLog.findFirst({ where: { ok: false, action: { startsWith: "Refused: removeUser" } } });
      expect(row).toMatchObject({ actorRole: "CSR", category: "users", ok: false });
      expect(row?.actorId).toBeTruthy();
    });

    it("lets a role with the permission through, with no refusal row", async () => {
      const { accessToken } = await login(t, "admin@test.dev");
      const res = await t.http().get("/api/v1/probe/remove-user").set("Authorization", `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(await t.prisma.auditLog.count({ where: { ok: false, action: { startsWith: "Refused: removeUser" } } })).toBe(0);
    });

    it("enforces ownership: a CSR sees their assigned client but not another CSR's", async () => {
      const { accessToken } = await login(t, "csr1@test.dev");
      const own = await t.http().get(`/api/v1/probe/clients/${clientId}`).set("Authorization", `Bearer ${accessToken}`);
      expect(own.status).toBe(200);
      const other = await t.http().get(`/api/v1/probe/clients/${otherClientId}`).set("Authorization", `Bearer ${accessToken}`);
      expect(other.status).toBe(403);
      expect(other.body.message).toBe(REASON.viewClient);
    });

    it("enforces ownership: a client sees only themselves", async () => {
      const { accessToken } = await login(t, "client1@test.dev");
      expect((await t.http().get(`/api/v1/probe/clients/${clientId}`).set("Authorization", `Bearer ${accessToken}`)).status).toBe(200);
      expect((await t.http().get(`/api/v1/probe/clients/${otherClientId}`).set("Authorization", `Bearer ${accessToken}`)).status).toBe(403);
    });

    it("enforces @Roles before the permission check", async () => {
      const { accessToken } = await login(t, "csr1@test.dev");
      const res = await t.http().post("/api/v1/probe/users").set("Authorization", `Bearer ${accessToken}`).send({ email: "x@test.dev" });
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe("PERMISSION_DENIED");
    });
  });

  describe("throttling", () => {
    let t: TestApp;
    beforeAll(async () => {
      t = await createApp();
      await resetDatabase(t.prisma);
    });
    afterAll(async () => {
      await t.close();
    });

    it("limits sign-in to 5 a minute per client address, then answers 429", async () => {
      const ip = "203.0.113.50";
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await t.http().post("/api/v1/auth/login").set("X-Forwarded-For", ip).send({ email: "nobody@test.dev", password: "Whatever-Pass-1" });
        statuses.push(res.status);
        if (i === 5) expect(res.body).toMatchObject({ success: false, errorCode: "TOO_MANY_REQUESTS" });
      }
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
      // A different address is not affected.
      const other = await t.http().post("/api/v1/auth/login").set("X-Forwarded-For", freshIp()).send({ email: "nobody@test.dev", password: "Whatever-Pass-1" });
      expect(other.status).toBe(401);
    });
  });

  describe("refresh-token cookie settings", () => {
    it("also returns the token in the body, and accepts it from the body, only when ALLOW_BODY_REFRESH=true", async () => {
      const t = await createApp({ ALLOW_BODY_REFRESH: "true" });
      try {
        await resetDatabase(t.prisma);
        await makeUser(t.prisma, { email: "admin@test.dev", role: "ADMIN" });
        const { res, cookie } = await login(t, "admin@test.dev");
        expect(res.body.data.refreshToken).toBe(cookie?.value);

        const viaBody = await t.http().post("/api/v1/auth/refresh").set("X-Forwarded-For", freshIp()).send({ refreshToken: res.body.data.refreshToken });
        expect(viaBody.status).toBe(200);
        expect(viaBody.body.data.refreshToken).toBeDefined();
      } finally {
        await t.close();
      }
    });

    it("marks the cookie Secure in production, and still httpOnly and SameSite", async () => {
      const t = await createApp({ NODE_ENV: "production" });
      try {
        await resetDatabase(t.prisma);
        await makeUser(t.prisma, { email: "admin@test.dev", role: "ADMIN" });
        const { res, cookie } = await login(t, "admin@test.dev");
        expect(cookie?.raw).toMatch(/HttpOnly/i);
        expect(cookie?.raw).toMatch(/Secure/i);
        expect(cookie?.raw).toMatch(/SameSite=Strict/i);
        expect(res.body.data.refreshToken).toBeUndefined();
      } finally {
        await t.close();
      }
    });

    it("honours REFRESH_COOKIE_SAMESITE=lax", async () => {
      const t = await createApp({ REFRESH_COOKIE_SAMESITE: "lax" });
      try {
        await resetDatabase(t.prisma);
        await makeUser(t.prisma, { email: "admin@test.dev", role: "ADMIN" });
        const { cookie } = await login(t, "admin@test.dev");
        expect(cookie?.raw).toMatch(/SameSite=Lax/i);
        expect(cookie?.raw).not.toMatch(/Secure/i);
      } finally {
        await t.close();
      }
    });

    it("refuses to start with SameSite=none unless the cookie is Secure, naming the setting", async () => {
      await expect(createApp({ REFRESH_COOKIE_SAMESITE: "none" })).rejects.toThrow(/REFRESH_COOKIE_SAMESITE=none needs a Secure cookie/);
    });

    it("accepts SameSite=none with REFRESH_COOKIE_SECURE=true and sends it Secure", async () => {
      const t = await createApp({ REFRESH_COOKIE_SAMESITE: "none", REFRESH_COOKIE_SECURE: "true" });
      try {
        await resetDatabase(t.prisma);
        await makeUser(t.prisma, { email: "admin@test.dev", role: "ADMIN" });
        const { cookie } = await login(t, "admin@test.dev");
        expect(cookie?.raw).toMatch(/SameSite=None/i);
        expect(cookie?.raw).toMatch(/Secure/i);
      } finally {
        await t.close();
      }
    });

    it("accepts SameSite=none in production, where the cookie is always Secure", async () => {
      const t = await createApp({ REFRESH_COOKIE_SAMESITE: "none", NODE_ENV: "production" });
      try {
        await resetDatabase(t.prisma);
        await makeUser(t.prisma, { email: "admin@test.dev", role: "ADMIN" });
        const { cookie } = await login(t, "admin@test.dev");
        expect(cookie?.raw).toMatch(/SameSite=None/i);
        expect(cookie?.raw).toMatch(/Secure/i);
      } finally {
        await t.close();
      }
    });

    it("clears a dead cookie when a refresh fails", async () => {
      const t = await createApp();
      try {
        await resetDatabase(t.prisma);
        await makeUser(t.prisma, { email: "admin@test.dev", role: "ADMIN" });
        const { cookie } = await login(t, "admin@test.dev");
        await t.http().post("/api/v1/auth/logout").set("X-Forwarded-For", freshIp()).set("Cookie", withCookie(cookie ?? "")).send({});
        const res = await t.http().post("/api/v1/auth/refresh").set("X-Forwarded-For", freshIp()).set("Cookie", withCookie(cookie ?? "")).send({});
        expect(res.status).toBe(401);
        expect(refreshCookie(res)?.value).toBe("");
      } finally {
        await t.close();
      }
    });
  });
});
