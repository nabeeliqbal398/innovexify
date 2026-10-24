import { createApp, login, makeUser, PASSWORD, refreshCookie, resetDatabase, withCookie, type TestApp } from "./helpers";

/** One office behind one NAT address, and one attacker address: the sign-in and refresh limits must treat them differently. */
describe("rate limits (e2e)", () => {
  let t: TestApp;
  // 20 wrong passwords are needed to lock an account here, so the sign-in THROTTLE is what answers the sixth attempt.
  beforeAll(async () => {
    t = await createApp({ LOGIN_MAX_ATTEMPTS: "20" });
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await makeUser(t.prisma, { email: "admin@test.dev", role: "ADMIN" });
    await makeUser(t.prisma, { email: "csr@test.dev", role: "CSR" });
    await makeUser(t.prisma, { email: "other@test.dev", role: "CSR" });
  });

  const OFFICE = "203.0.113.7";
  const loginFrom = (ip: string, email: string, password = "Wrong-Password-1") =>
    t.http().post("/api/v1/auth/login").set("X-Forwarded-For", ip).send({ email, password });

  describe("refresh", () => {
    it("lets one address reload the app 8 times in a minute", async () => {
      const { cookie } = await login(t, "admin@test.dev");
      let current = cookie?.value ?? "";
      for (let i = 1; i <= 8; i++) {
        const res = await t.http().post("/api/v1/auth/refresh").set("X-Forwarded-For", OFFICE).set("Cookie", withCookie(current)).send({});
        expect({ attempt: i, status: res.status }).toEqual({ attempt: i, status: 200 });
        current = refreshCookie(res)?.value ?? "";
      }
    });

    it("has a per-address ceiling (REFRESH_IP_CEILING) that still stops a flood", async () => {
      const limited = await createApp({ REFRESH_IP_CEILING: "3" });
      try {
        const statuses: number[] = [];
        for (let i = 0; i < 5; i++) {
          statuses.push((await limited.http().post("/api/v1/auth/refresh").set("X-Forwarded-For", "198.51.100.9").send({})).status);
        }
        // No cookie, so each is 401 until the limit, then 429.
        expect(statuses).toEqual([401, 401, 401, 429, 429]);
      } finally {
        await limited.close();
      }
    });
  });

  describe("sign-in", () => {
    it("throttles the sixth wrong password for one email from one address", async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) statuses.push((await loginFrom(OFFICE, "csr@test.dev")).status);
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
      const sixth = await loginFrom(OFFICE, "csr@test.dev");
      expect(sixth.body.errorCode).not.toBe("ACCOUNT_LOCKED");
    });

    it("does not throttle a different email from the same address (one office, one NAT)", async () => {
      for (let i = 0; i < 6; i++) await loginFrom(OFFICE, "csr@test.dev");
      const other = await loginFrom(OFFICE, "other@test.dev", PASSWORD);
      expect(other.status).toBe(200);
      const admin = await loginFrom(OFFICE, "admin@test.dev", PASSWORD);
      expect(admin.status).toBe(200);
    });

    it("counts the same mailbox written differently as one email", async () => {
      const spellings = ["csr@test.dev", "CSR@test.dev", " csr@Test.dev ", "csr@test.DEV", "Csr@test.dev", "csr@test.dev"];
      const statuses: number[] = [];
      for (const email of spellings) statuses.push((await loginFrom(OFFICE, email)).status);
      expect(statuses[5]).toBe(429);
    });

    it("one attacking address cannot use up another address's attempts for the same email", async () => {
      for (let i = 0; i < 6; i++) await loginFrom("192.0.2.66", "csr@test.dev");
      expect((await loginFrom("192.0.2.66", "csr@test.dev")).status).toBe(429);
      expect((await loginFrom("203.0.113.50", "csr@test.dev", PASSWORD)).status).toBe(200);
    });

    it("still locks the account itself after LOGIN_MAX_ATTEMPTS failures, whatever the address", async () => {
      const strict = await createApp({ LOGIN_MAX_ATTEMPTS: "5" });
      try {
        for (let i = 0; i < 5; i++) {
          const res = await strict.http().post("/api/v1/auth/login").set("X-Forwarded-For", `192.0.2.${100 + i}`).send({ email: "csr@test.dev", password: "Wrong-Password-1" });
          expect(res.status).toBe(401);
        }
        const res = await strict.http().post("/api/v1/auth/login").set("X-Forwarded-For", "192.0.2.200").send({ email: "csr@test.dev", password: PASSWORD });
        expect(res.status).toBe(429);
        expect(res.body.errorCode).toBe("ACCOUNT_LOCKED");
      } finally {
        await strict.close();
      }
    });
  });

  describe("TRUST_PROXY", () => {
    it("reads the address the proxy added, not the leading entries the client wrote", async () => {
      // TRUST_PROXY=true means one proxy: only the LAST X-Forwarded-For entry is believed.
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await t.http().post("/api/v1/auth/login").set("X-Forwarded-For", `10.9.9.${i}, 198.51.100.200`).send({ email: "csr@test.dev", password: "Wrong-Password-1" });
        statuses.push(res.status);
      }
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    });

    it("uses the socket address when no proxy is configured, whatever the header says", async () => {
      const direct = await createApp({ TRUST_PROXY: "false" });
      try {
        const statuses: number[] = [];
        for (let i = 0; i < 6; i++) {
          const res = await direct.http().post("/api/v1/auth/login").set("X-Forwarded-For", `10.8.8.${i}`).send({ email: "csr@test.dev", password: "Wrong-Password-1" });
          statuses.push(res.status);
        }
        expect(statuses[5]).toBe(429);
      } finally {
        await direct.close();
      }
    });

    it("refuses a blanket setting at startup", async () => {
      await expect(createApp({ TRUST_PROXY: "all" })).rejects.toThrow(/TRUST_PROXY must be false, true/);
    });
  });

  describe("accept-invitation", () => {
    it("stays strict: the sixth attempt from one address is throttled", async () => {
      const token = "x".repeat(48);
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        statuses.push((await t.http().post("/api/v1/auth/accept-invitation").set("X-Forwarded-For", "198.51.100.77").send({ token, password: PASSWORD })).status);
      }
      expect(statuses[5]).toBe(429);
      expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    });
  });
});
