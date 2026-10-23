// @vitest-environment node
import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeStore } from "@/store";
import { peopleApi } from "@/store/api/people";
import { resetRefreshState } from "@/store/api/base";
import { sessionActions } from "@/store/sessionSlice";
import type { User } from "@/types/domain";

const me: User = { id: "u1", name: "Sarah Bennett", email: "sarah@example.com", role: "ADMIN", status: "Active" };

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ok = (data: unknown): Response => json(200, { success: true, statusCode: 200, data: Array.isArray(data) ? data : data, meta: { page: 1, limit: 10, total: 0, totalPages: 1 }, timestamp: "", path: "" });
const failure = (status: number, errorCode: string, message = "nope"): Response =>
  json(status, { success: false, statusCode: status, errorCode, message, timestamp: "", path: "" });

interface Seen {
  path: string;
  auth: string | null;
}

/** A fake server: tokens other than "good" are expired, and the refresh endpoint answers as told. */
function server(refresh: () => Response) {
  const seen: Seen[] = [];
  const fetchMock = vi.fn(async (input: Request) => {
    const url = new URL(input.url);
    const auth = input.headers.get("authorization");
    seen.push({ path: url.pathname, auth });
    if (url.pathname === "/api/v1/auth/refresh") {
      await new Promise((r) => setTimeout(r, 20)); // slow enough for every parallel request to be waiting
      return refresh();
    }
    if (auth !== "Bearer good") return failure(401, "TOKEN_EXPIRED", "Your session has expired.");
    return ok([]);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { seen, refreshes: () => seen.filter((s) => s.path === "/api/v1/auth/refresh").length };
}

function signedInStore(token: string) {
  const store = makeStore();
  store.dispatch(sessionActions.signedIn({ accessToken: token, user: me }));
  return store;
}

beforeEach(() => {
  resetRefreshState();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the API client", () => {
  it("runs exactly one refresh when five requests fail at the same moment, then retries each once", async () => {
    const fake = server(() => ok({ accessToken: "good", expiresIn: 900 }));
    const store = signedInStore("stale");
    const results = await Promise.all([1, 2, 3, 4, 5].map((page) => store.dispatch(peopleApi.endpoints.users.initiate({ page }))));

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(fake.refreshes()).toBe(1);
    // Five first tries with the stale token, one refresh, five retries with the new one: no more.
    expect(fake.seen.filter((s) => s.path === "/api/v1/users" && s.auth === "Bearer stale")).toHaveLength(5);
    expect(fake.seen.filter((s) => s.path === "/api/v1/users" && s.auth === "Bearer good")).toHaveLength(5);
    expect(store.getState().session.accessToken).toBe("good");
    expect(store.getState().session.status).toBe("authenticated");
  });

  it("ends the session and says so when the refresh is refused, without retrying or looping", async () => {
    const fake = server(() => failure(401, "TOKEN_INVALID", "Sign in again."));
    const store = signedInStore("stale");
    const results = await Promise.all([1, 2, 3].map((page) => store.dispatch(peopleApi.endpoints.users.initiate({ page }))));

    expect(results.every((r) => r.status !== "fulfilled")).toBe(true);
    expect(fake.refreshes()).toBe(1);
    expect(fake.seen.filter((s) => s.path === "/api/v1/users")).toHaveLength(3); // never retried
    const session = store.getState().session;
    expect(session.status).toBe("anonymous");
    expect(session.accessToken).toBeNull();
    expect(session.user).toBeNull();
    expect(session.notice).toMatch(/session ended/i);
  });

  it("does not loop when the retried request is refused again", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        const path = new URL(input.url).pathname;
        seen.push(path);
        if (path === "/api/v1/auth/refresh") return ok({ accessToken: "still-bad", expiresIn: 900 });
        return failure(401, "TOKEN_EXPIRED");
      }),
    );
    const store = signedInStore("stale");
    const result = await store.dispatch(peopleApi.endpoints.users.initiate({ page: 1 }));
    expect(result.status).toBe("rejected");
    expect(seen.filter((p) => p === "/api/v1/auth/refresh")).toHaveLength(1);
    expect(seen.filter((p) => p === "/api/v1/users")).toHaveLength(2); // the first try and the single retry
  });

  it("keeps the session when the refresh could not reach the server (nothing says it is over)", async () => {
    const fake = server(() => failure(503, "SERVICE_UNAVAILABLE", "Try again shortly."));
    const store = signedInStore("stale");
    const result = await store.dispatch(peopleApi.endpoints.users.initiate({ page: 1 }));
    expect(result.status).toBe("rejected");
    expect(fake.refreshes()).toBe(1);
    expect(store.getState().session.status).toBe("authenticated");
  });

  it("refreshes silently when the token is gone from memory", async () => {
    const fake = server(() => ok({ accessToken: "good", expiresIn: 900 }));
    const store = signedInStore("stale");
    store.dispatch(sessionActions.tokenSet(""));
    // A request with no token is answered UNAUTHENTICATED; the client recovers through the cookie.
    const stub = vi.fn(async (input: Request) => {
      const url = new URL(input.url);
      fake.seen.push({ path: url.pathname, auth: input.headers.get("authorization") });
      if (url.pathname === "/api/v1/auth/refresh") return ok({ accessToken: "good", expiresIn: 900 });
      return input.headers.get("authorization") === "Bearer good" ? ok([]) : failure(401, "UNAUTHENTICATED", "Sign in to continue.");
    });
    vi.stubGlobal("fetch", stub);
    const result = await store.dispatch(peopleApi.endpoints.users.initiate({ page: 1 }));
    expect(result.status).toBe("fulfilled");
    expect(store.getState().session.accessToken).toBe("good");
  });

  it("does not try to refresh for a wrong password", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        seen.push(new URL(input.url).pathname);
        return failure(401, "INVALID_CREDENTIALS", "That email and password do not match.");
      }),
    );
    const { authApi } = await import("@/store/api/auth");
    const store = makeStore();
    const result = await store.dispatch(authApi.endpoints.login.initiate({ email: "a@b.co", password: "x" }));
    expect("error" in result).toBe(true);
    expect(seen).toEqual(["/api/v1/auth/login"]);
  });

  it("never keeps the access token anywhere but memory", () => {
    // The token is Redux state only: the store, API and session code never reach for browser storage.
    const dir = path.resolve(__dirname, "../../src/store");
    const files = fs.readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts"));
    for (const file of files) {
      const source = fs.readFileSync(path.join(dir, file), "utf8");
      expect(source, file).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    }
    expect(fs.readFileSync(path.resolve(__dirname, "../../src/lib/session.ts"), "utf8")).not.toMatch(/localStorage|sessionStorage/);
  });
});
