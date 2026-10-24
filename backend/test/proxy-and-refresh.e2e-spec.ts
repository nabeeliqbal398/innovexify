import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";

import { AuthService } from "../src/modules/auth/service/auth.service";
import { bearerFor, createApp, freshIp, makeUser, refreshCookie, resetDatabase, withCookie, type TestApp } from "./helpers";

/** A single reverse proxy in front of the app: it sets X-Forwarded-For to the "client" the test names (as nginx or Caddy would). */
async function fakeProxy(appPort: number): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const upstream = http.request(
      { host: "127.0.0.1", port: appPort, path: req.url, method: req.method, headers: { ...req.headers, "x-forwarded-for": String(req.headers["x-client"] ?? "") } },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => res.writeHead(502).end());
    req.pipe(upstream);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: (server.address() as AddressInfo).port, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

async function throughProxy(env: Record<string, string>, run: (proxy: { port: number }, t: TestApp) => Promise<void>): Promise<void> {
  const t = await createApp(env);
  await t.app.listen(0, "127.0.0.1");
  const proxy = await fakeProxy((t.app.getHttpServer().address() as AddressInfo).port);
  try {
    await run(proxy, t);
  } finally {
    await proxy.close();
    await t.close();
  }
}

const USERS = 200;
const refreshAs = (port: number, client: string, cookie?: string) =>
  fetch(`http://127.0.0.1:${port}/api/v1/auth/refresh`, { method: "POST", headers: { "content-type": "application/json", "x-client": client, ...(cookie ? { cookie } : {}) }, body: "{}" });

describe("TRUST_PROXY behind a single proxy (e2e)", () => {
  // The per-address ceiling is set low (50) so 200 callers show the difference without 1,200 requests.
  const env = { REFRESH_IP_CEILING: "50" };

  it("TRUST_PROXY=false: 200 users with different forwarded addresses all share ONE bucket (the address of the proxy)", async () => {
    await throughProxy({ ...env, TRUST_PROXY: "false" }, async ({ port }) => {
      const statuses: number[] = [];
      for (let i = 0; i < USERS; i++) statuses.push((await refreshAs(port, `10.20.${i >> 8}.${i & 255}`)).status);
      expect(statuses.filter((s) => s === 429)).toHaveLength(USERS - 50); // everything after the 50th, whoever sent it
      expect(statuses.slice(0, 50).every((s) => s === 401)).toBe(true);
    });
  });

  it("TRUST_PROXY=1: the same 200 users each have their own bucket and none is limited", async () => {
    await throughProxy({ ...env, TRUST_PROXY: "1" }, async ({ port }) => {
      const statuses: number[] = [];
      for (let i = 0; i < USERS; i++) statuses.push((await refreshAs(port, `10.20.${i >> 8}.${i & 255}`)).status);
      expect(statuses.filter((s) => s === 429)).toHaveLength(0);
      // ...while one of them going over their own bucket is still stopped.
      const same: number[] = [];
      for (let i = 0; i < 55; i++) same.push((await refreshAs(port, "10.99.0.1")).status);
      expect(same.filter((s) => s === 429).length).toBeGreaterThan(0);
    });
  });

  it("a caller cannot pick a bucket with a header they write: only the last entry, added by the proxy, counts", async () => {
    await throughProxy({ ...env, TRUST_PROXY: "1" }, async ({ port }) => {
      const statuses: number[] = [];
      // Every request really comes from 10.77.0.1 and merely CLAIMS other addresses first.
      for (let i = 0; i < 60; i++) statuses.push((await refreshAs(port, `203.0.113.${i}, 10.77.0.1`)).status);
      expect(statuses.filter((s) => s === 429)).toHaveLength(10);
    });
  });

  it("/api/health/detail (Admin) reports the address the server sees and the TRUST_PROXY value", async () => {
    for (const [setting, expectedIp, expectedValue] of [["false", "127.0.0.1", false], ["1", "198.51.100.23", 1]] as const) {
      await throughProxy({ TRUST_PROXY: setting }, async ({ port }, t) => {
        await resetDatabase(t.prisma);
        const admin = await makeUser(t.prisma, { email: "admin@test.dev", role: "ADMIN" });
        const res = await fetch(`http://127.0.0.1:${port}/api/health/detail`, { headers: { authorization: bearerFor(t, admin), "x-client": "198.51.100.23" } });
        const { client } = ((await res.json()) as { data: { client: { ip: string; socketAddress: string; xForwardedFor: string | null; trustProxy: number | false } } }).data;
        expect(client.trustProxy).toBe(expectedValue);
        expect(client.xForwardedFor).toBe("198.51.100.23");
        expect(client.ip.replace("::ffff:", "")).toBe(expectedIp);
        expect(client.socketAddress.replace("::ffff:", "")).toBe("127.0.0.1"); // always the proxy
      });
    }
  });
});

describe("refresh is limited per session, with a per-address ceiling behind it (e2e)", () => {
  async function sessions(t: TestApp, count: number) {
    await resetDatabase(t.prisma);
    const auth = t.app.get(AuthService);
    const out: Array<{ cookie: string; familyId: string }> = [];
    for (let i = 0; i < count; i++) {
      const user = await makeUser(t.prisma, { email: `u${i}@test.dev`, role: "CSR" });
      const familyId = randomUUID();
      const session = await auth.openSession(user.id, familyId, {});
      out.push({ cookie: session.refreshToken, familyId });
    }
    return out;
  }
  const refresh = (t: TestApp, ip: string, cookie: string) => t.http().post("/api/v1/auth/refresh").set("X-Forwarded-For", ip).set("Cookie", withCookie(cookie)).send({});

  it("200 people behind one address can all renew (the old per-address limit of 120 would have refused 80 of them)", async () => {
    const t = await createApp();
    try {
      const all = await sessions(t, USERS);
      const statuses: number[] = [];
      for (const s of all) statuses.push((await refresh(t, "203.0.113.5", s.cookie)).status);
      expect(statuses.filter((s) => s !== 200)).toEqual([]);
    } finally {
      await t.close();
    }
  });

  it("one busy session is stopped at REFRESH_THROTTLE_LIMIT, with a clear message, while its neighbour behind the same address is not", async () => {
    const t = await createApp({ REFRESH_THROTTLE_LIMIT: "3" });
    try {
      const [busy, quiet] = await sessions(t, 2);
      let cookie = busy?.cookie ?? "";
      for (let i = 0; i < 3; i++) {
        const res = await refresh(t, "203.0.113.6", cookie);
        expect(res.status).toBe(200);
        cookie = refreshCookie(res)?.value ?? "";
      }
      const refused = await refresh(t, "203.0.113.6", cookie);
      expect(refused.status).toBe(429);
      expect(refused.body.errorCode).toBe("TOO_MANY_REQUESTS");
      expect(refused.body.message).toMatch(/limit is 3 a minute/);
      // The refusal did not use up or revoke the token: it works again once the window passes.
      const stored = await t.prisma.refreshToken.findFirstOrThrow({ where: { familyId: busy?.familyId }, orderBy: { createdAt: "desc" } });
      expect(stored.revokedAt).toBeNull();
      expect((await refresh(t, "203.0.113.6", quiet?.cookie ?? "")).status).toBe(200);
    } finally {
      await t.close();
    }
  });

  it("the per-address ceiling still stops a flood of unrecognised tokens", async () => {
    const t = await createApp({ REFRESH_IP_CEILING: "5" });
    try {
      const ip = freshIp();
      const statuses: number[] = [];
      for (let i = 0; i < 8; i++) statuses.push((await refresh(t, ip, `garbage-${i}-${"x".repeat(40)}`)).status);
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429, 429, 429]);
    } finally {
      await t.close();
    }
  });
});
