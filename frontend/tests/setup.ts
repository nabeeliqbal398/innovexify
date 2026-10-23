import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// The browser resolves "/api/v1/..." against the page; Node's Request needs an absolute URL, so give it one.
const NativeRequest = globalThis.Request;
class AbsoluteRequest extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    // jsdom's AbortSignal is not the one Node's Request accepts; the tests never abort, so it is left out.
    const { signal: _signal, ...rest } = init ?? {};
    void _signal;
    super(typeof input === "string" && input.startsWith("/") ? `http://localhost${input}` : input, rest);
  }
}
globalThis.Request = AbsoluteRequest as typeof Request;

afterEach(() => {
  cleanup();
});
