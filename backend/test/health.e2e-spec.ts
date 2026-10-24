import fs from "node:fs";

import { StorageService } from "../src/common/storage/storage.service";
import { bearerFor, createApp, makeUser, resetDatabase, type TestApp } from "./helpers";

describe("health (e2e)", () => {
  describe("liveness and readiness", () => {
    let t: TestApp;
    beforeAll(async () => {
      t = await createApp();
    });
    afterAll(async () => {
      await t.close();
    });
    beforeEach(async () => {
      await resetDatabase(t.prisma);
    });

    it("keeps /api/health public and minimal", async () => {
      const res = await t.http().get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ status: "ok", database: "up" });
    });

    it("reports every dependency on /api/health/ready without a session, and nothing but pass or fail", async () => {
      const res = await t.http().get("/api/health/ready");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: "ok",
        checks: { database: { ok: true }, storage: { ok: true }, mail: { ok: true, configured: false }, scanner: { ok: true, enabled: false } },
        timestamp: expect.any(String),
      });
      // No path, host, version or setting leaves with it.
      expect(res.text).not.toMatch(/localhost|postgres|innovexify|storage\/|tmp|smtp/i);
    });

    it("answers 503 and names the failing check when storage cannot be written", async () => {
      const storage = t.app.get(StorageService);
      const original = storage.checkWritable.bind(storage);
      storage.checkWritable = () => Promise.reject(new Error("EACCES: permission denied, open '/app/storage/.health'"));
      try {
        const res = await t.http().get("/api/health/ready");
        expect(res.status).toBe(503);
        expect(res.body.status).toBe("unavailable");
        expect(res.body.checks.storage).toEqual({ ok: false });
        expect(res.body.checks.database).toEqual({ ok: true });
        expect(res.text).not.toContain("EACCES"); // the reason goes to the log, not to the monitor
      } finally {
        storage.checkWritable = original;
      }
    });

    it("answers 503 when the database cannot be reached", async () => {
      const original = t.prisma.$queryRaw.bind(t.prisma);
      (t.prisma as unknown as { $queryRaw: unknown }).$queryRaw = () => Promise.reject(new Error("connection refused"));
      try {
        const res = await t.http().get("/api/health/ready");
        expect(res.status).toBe(503);
        expect(res.body.checks.database).toEqual({ ok: false });
        expect((await t.http().get("/api/health")).status).toBe(503);
      } finally {
        (t.prisma as unknown as { $queryRaw: unknown }).$queryRaw = original;
      }
    });

    it("does not leave probe files behind in storage", async () => {
      await t.http().get("/api/health/ready");
      const root = (t.app.get(StorageService) as unknown as { root: string }).root;
      const names = fs.readdirSync(root);
      expect(names.filter((n) => n.startsWith(".health"))).toEqual([]);
    });
  });

  describe("with a scanner that is switched on", () => {
    it("reports 503 when ClamAV cannot be reached, and says the scanner is enabled", async () => {
      const t = await createApp({ VIRUS_SCANNER: "clamav", CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: "1", CLAMAV_TIMEOUT_MS: "1500" });
      try {
        const res = await t.http().get("/api/health/ready");
        expect(res.status).toBe(503);
        expect(res.body.checks.scanner).toEqual({ ok: false, enabled: true });
        expect(res.body.checks.database).toEqual({ ok: true });
      } finally {
        await t.close();
      }
    });
  });

  describe("/api/health/detail", () => {
    let t: TestApp;
    beforeAll(async () => {
      t = await createApp({
        MAIL_TRANSPORT: "smtp",
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_USER: "mailer",
        SMTP_PASSWORD: "super-secret-smtp-password",
        MAIL_FROM: "Innovexify <no-reply@example.com>",
      });
    });
    afterAll(async () => {
      await t.close();
    });
    beforeEach(async () => {
      await resetDatabase(t.prisma);
    });

    it("is not public: no token is 401, a CSR is 403", async () => {
      const csr = await makeUser(t.prisma, { email: "csr@test.dev", role: "CSR" });
      expect((await t.http().get("/api/health/detail")).status).toBe(401);
      expect((await t.http().get("/api/health/detail").set("Authorization", bearerFor(t, csr))).status).toBe(403);
    });

    it("tells an Admin whether mail is configured, without ever showing the password", async () => {
      const admin = await makeUser(t.prisma, { email: "admin@test.dev", role: "ADMIN" });
      const res = await t.http().get("/api/health/detail").set("Authorization", bearerFor(t, admin));
      expect(res.status).toBe(200);
      expect(res.body.data.mail).toEqual({ transport: "smtp", configured: true, host: "smtp.example.com", port: 587, from: "Innovexify <no-reply@example.com>" });
      expect(res.body.data.checks.mail).toEqual({ ok: true, configured: true });
      expect(res.body.data.status).toBe("ok");
      expect(res.text).not.toContain("super-secret-smtp-password");
      expect(res.text).not.toContain("mailer");
    });
  });

  describe("on the log transport", () => {
    it("says mail is not configured", async () => {
      const dev = await createApp();
      try {
        await resetDatabase(dev.prisma);
        const admin = await makeUser(dev.prisma, { email: "admin@test.dev", role: "ADMIN" });
        const res = await dev.http().get("/api/health/detail").set("Authorization", bearerFor(dev, admin));
        expect(res.body.data.mail).toMatchObject({ transport: "log", configured: false, host: null });
        expect(res.body.data.checks.mail).toEqual({ ok: true, configured: false });
      } finally {
        await dev.close();
      }
    });
  });
});
