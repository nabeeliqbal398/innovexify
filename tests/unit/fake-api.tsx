import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { vi } from "vitest";

import { makeStore } from "@/store";
import { sessionActions } from "@/store/sessionSlice";
import type { User } from "@/types/domain";

export const admin: User = { id: "u1", name: "Sarah Bennett", email: "sarah@example.com", role: "ADMIN", status: "Active" };

export const okEnvelope = (data: unknown, meta?: unknown): Response =>
  new Response(JSON.stringify({ success: true, statusCode: 200, data, ...(meta ? { meta } : {}), timestamp: "", path: "" }), { status: 200, headers: { "content-type": "application/json" } });

export const failure = (status: number, errorCode: string, message: string, errors: Array<{ field: string; message: string }> = []): Response =>
  new Response(JSON.stringify({ success: false, statusCode: status, errorCode, message, errors, timestamp: "", path: "" }), { status, headers: { "content-type": "application/json" } });

export const page = (items: unknown[]): Response => okEnvelope(items, { page: 1, limit: 100, total: items.length, totalPages: 1 });

type Handler = (request: { url: URL; method: string; body: unknown }) => Response | Promise<Response> | undefined;

/**
 * A fake server for component tests: the first handler that returns a response wins; anything unhandled is an empty page,
 * so a form's side requests (client lists, directories) never fail a test. Every request is recorded.
 */
export function fakeApi(...handlers: Handler[]) {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request) => {
      const url = new URL(input.url);
      const method = input.method;
      const text = method === "GET" || method === "HEAD" ? "" : await input.clone().text();
      const body = text ? (JSON.parse(text) as unknown) : undefined;
      requests.push({ method, path: url.pathname + url.search, body });
      for (const h of handlers) {
        const r = await h({ url, method, body });
        if (r) return r;
      }
      return page([]);
    }),
  );
  return requests;
}

export function renderSignedIn(ui: ReactNode, user: User = admin) {
  const store = makeStore();
  store.dispatch(sessionActions.signedIn({ accessToken: "good", user }));
  return { store, ...render(<Provider store={store}>{ui}</Provider>) };
}
