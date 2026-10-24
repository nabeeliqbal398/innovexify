import { StorageService } from "../src/common/storage/storage.service";
import { AppConfig } from "../src/config/app-config";
import { api, bearerFor, clearStorage, createApp, FILES, freshIp, makeDocument, makeUser, PASSWORD, PRODUCTION_ENV, refreshCookie, resetDatabase, type TestApp } from "./helpers";

const PRODUCTION = PRODUCTION_ENV;

describe("security headers", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("sends the Helmet headers on /api responses, successes and errors alike", async () => {
    for (const res of [await t.http().get("/api/health"), await t.http().get("/api/v1/auth/me"), await t.http().get("/api/v1/nothing-here")]) {
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["strict-transport-security"]).toMatch(/max-age=\d+/);
      expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
      expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
      expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'self'");
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
      expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
      expect(res.headers["x-powered-by"]).toBeUndefined();
    }
  });
});

describe("unexpected errors", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp(PRODUCTION);
  });
  afterAll(async () => {
    await t.close();
  });

  const LEAKS = [/hunter2/, /password/i, /secret/i, /postgresql:/i, /\/srv\/app/, /\.ts:\d+/, /node_modules/, /\bat \S+ \(/, /SELECT/i, /table_that_does_not_exist/, /prisma/i, /stack/i, /Error:/];

  it.each([
    ["a thrown error", "/api/v1/probe/explode"],
    ["a database error that contains SQL", "/api/v1/probe/sql"],
  ])("answers %s with a plain 500 and nothing from the inside", async (_label, url) => {
    const res = await t.http().get(url).set("X-Forwarded-For", freshIp());
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ success: false, statusCode: 500, errorCode: "INTERNAL_ERROR" });
    expect(res.body.message).toMatch(/something on our side went wrong/i);
    const raw = res.text;
    for (const leak of LEAKS) expect({ leak: String(leak), found: leak.test(raw) }).toEqual({ leak: String(leak), found: false });
    expect(Object.keys(res.body).sort()).toEqual(["errorCode", "message", "path", "requestId", "statusCode", "success", "timestamp"]);
    expect(res.headers["x-request-id"]).toBe(res.body.requestId); // support can find the log line
  });

  it("answers an unexpected failure in a body parser or a bad route without a stack either", async () => {
    const bad = await t.http().post("/api/v1/auth/login").set("X-Forwarded-For", freshIp()).set("Content-Type", "application/json").send("{ not json");
    expect(bad.status).toBeLessThan(500);
    for (const leak of [/SyntaxError/, /node_modules/, /\bat \S+ \(/]) expect(leak.test(bad.text)).toBe(false);
  });
});

describe("uploads", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await clearStorage(t);
  });

  it("cannot be fetched without signing in, by the API route or by guessing a file path", async () => {
    const client = await makeUser(t.prisma, { email: "client@test.dev", role: "CLIENT" });
    const key = "0f0f0f0f-aaaa-4bbb-8ccc-123456789abc";
    await t.app.get(StorageService).put(key, FILES.pdf());
    const doc = await makeDocument(t.prisma, { clientId: client.id, status: "SUBMITTED", storageKey: key, fileName: "proof.pdf", mimeType: "application/pdf" });

    expect((await api(t).get(`/api/v1/documents/${doc.id}/download`)).status).toBe(401);
    expect((await api(t, "Bearer not-a-token").get(`/api/v1/documents/${doc.id}/download`)).status).toBe(401);
    for (const path of [`/${key}`, `/uploads/${key}`, `/storage/${key}`, `/api/uploads/${key}`, `/api/storage/${key}`, `/api/v1/uploads/${key}`, `/api/v1/files/${key}`, `/public/${key}`, `/static/${key}`, `/uploads/${key.slice(0, 2)}/${key}`]) {
      const res = await t.http().get(path);
      expect({ path, served: res.status === 200 }).toEqual({ path, served: false });
      expect(Buffer.from(res.text ?? "").includes("%PDF")).toBe(false);
    }
    // And with a session it works, so the checks above are not passing for the wrong reason.
    const ok = await api(t, bearerFor(t, client)).get(`/api/v1/documents/${doc.id}/download`).buffer(true);
    expect(ok.status).toBe(200);
  });
});

describe("CORS", () => {
  const EVIL = "https://evil.example";

  it("is closed when no origin is allowed (the production default): no CORS headers, preflight included", async () => {
    // The development .env lists a CORS origin, and Windows treats an empty variable as unset, so a blank stands for "no origins" here. Unset in production gives the same result (env.spec.ts).
    const t = await createApp({ ...PRODUCTION, CORS_ORIGINS: " " });
    try {
      expect(t.app.get(AppConfig).env.CORS_ORIGINS).toEqual([]);
      for (const origin of [EVIL, "http://localhost:3000"]) {
        const get = await t.http().get("/api/health").set("Origin", origin);
        expect(get.status).toBe(200);
        expect(get.headers["access-control-allow-origin"]).toBeUndefined();
        expect(get.headers["access-control-allow-credentials"]).toBeUndefined();
        const preflight = await t.http().options("/api/v1/auth/login").set("Origin", origin).set("Access-Control-Request-Method", "POST");
        expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();
        expect(preflight.headers["access-control-allow-methods"]).toBeUndefined();
      }
    } finally {
      await t.close();
    }
  });

  it("an explicit allow-list still works, and only for the listed origin (so the check above is meaningful)", async () => {
    const t = await createApp({ CORS_ORIGINS: "https://app.example.com" });
    try {
      const allowed = await t.http().get("/api/health").set("Origin", "https://app.example.com");
      expect(allowed.headers["access-control-allow-origin"]).toBe("https://app.example.com");
      const other = await t.http().get("/api/health").set("Origin", EVIL);
      expect(other.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await t.close();
    }
  });
});

describe("API docs", () => {
  it("are not served in production: /api/docs, /api/docs-json and /api/docs-yaml are all 404", async () => {
    const t = await createApp(PRODUCTION, undefined, { docs: true });
    try {
      for (const path of ["/api/docs", "/api/docs/", "/api/docs-json", "/api/docs-yaml", "/api/v1/docs-json", "/api/swagger", "/api-json"]) {
        const res = await t.http().get(path);
        expect({ path, status: res.status }).toEqual({ path, status: 404 });
        expect(res.text).not.toMatch(/openapi|swagger-ui/i);
      }
    } finally {
      await t.close();
    }
  });

  it("are served outside production (so the 404s above are the switch, not a missing feature)", async () => {
    const t = await createApp({}, undefined, { docs: true });
    try {
      const json = await t.http().get("/api/docs-json");
      expect(json.status).toBe(200);
      expect(json.body.openapi).toBeDefined();
      expect((await t.http().get("/api/docs")).status).toBe(200);
    } finally {
      await t.close();
    }
  });
});

describe("the refresh cookie in production", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp(PRODUCTION);
  });
  afterAll(async () => {
    await t.close();
  });

  it("is HttpOnly, Secure, SameSite=Strict, limited to the auth routes, and kept out of the JSON body", async () => {
    await resetDatabase(t.prisma);
    await makeUser(t.prisma, { email: "admin@test.dev", role: "ADMIN" });
    const res = await t.http().post("/api/v1/auth/login").set("X-Forwarded-For", freshIp()).send({ email: "admin@test.dev", password: PASSWORD });
    expect(res.status).toBe(200);
    const cookie = refreshCookie(res);
    expect(cookie?.raw).toBeDefined();
    const flags = (cookie?.raw ?? "").split(";").map((part) => part.trim());
    expect(flags).toEqual(expect.arrayContaining(["HttpOnly", "Secure", "SameSite=Strict", "Path=/api/v1/auth"]));
    expect(flags.some((f) => /^Max-Age=\d+$/.test(f))).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(cookie?.value ?? "no cookie");
    expect(res.body.data.refreshToken).toBeUndefined();

    // Sign-out clears it with the same attributes, so the browser actually drops it.
    const out = await t.http().post("/api/v1/auth/logout").set("X-Forwarded-For", freshIp()).set("Cookie", `refresh_token=${cookie?.value}`).send({});
    const cleared = (refreshCookie(out)?.raw ?? "").split(";").map((part) => part.trim());
    expect(cleared).toEqual(expect.arrayContaining(["Path=/api/v1/auth", "HttpOnly", "Secure", "SameSite=Strict"]));
    expect(cleared[0]).toBe("refresh_token=");
  });
});

describe("logs", () => {
  let t: TestApp;
  const captured: string[] = [];
  let original: typeof process.stdout.write;

  beforeAll(async () => {
    // Production logs are plain JSON on stdout, which can be captured here (development logs go through a pretty-printer thread).
    original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      captured.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return (original as (...args: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof process.stdout.write;
    t = await createApp({ ...PRODUCTION, LOG_LEVEL: "info" });
  });
  afterAll(async () => {
    await t.close();
    process.stdout.write = original;
  });

  it("never contain a one-time link token, a password, a cookie or a bearer token", async () => {
    const linkToken = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU2Nzg5YWJjZGVm";
    const password = "Sup3r-Secret-Passw0rd-XYZ";
    const refresh = "REFRESH-COOKIE-VALUE-0123456789-abcdefghijklmnopqrstuvwxyz";
    const bearer = "eyJhbGciOiJIUzI1NiJ9.BEARER-PAYLOAD.signature";
    captured.length = 0;

    await t.http().get(`/api/v1/auth/reset-password/${linkToken}`).set("X-Forwarded-For", freshIp());
    await t.http().get(`/api/v1/auth/invitations/${linkToken}`).set("X-Forwarded-For", freshIp());
    await t.http().post("/api/v1/auth/reset-password").set("X-Forwarded-For", freshIp()).send({ token: linkToken, password });
    await t.http().post("/api/v1/auth/login").set("X-Forwarded-For", freshIp()).send({ email: "nobody@test.dev", password });
    await t.http().post("/api/v1/auth/refresh").set("X-Forwarded-For", freshIp()).set("Cookie", `refresh_token=${refresh}`).send({});
    await t.http().get("/api/v1/auth/me").set("Authorization", `Bearer ${bearer}`);
    await t.http().get("/api/v1/probe/explode").set("X-Forwarded-For", freshIp());

    const log = captured.join("");
    expect(log.length).toBeGreaterThan(200); // something was logged, so the absences below mean something
    for (const secret of [linkToken, password, refresh, bearer]) expect({ secret: secret.slice(0, 12), leaked: log.includes(secret) }).toEqual({ secret: secret.slice(0, 12), leaked: false });
    expect(log).toContain("/auth/reset-password/[REDACTED]");
  });
});
