import { describe, expect, it } from "vitest";

import { NETWORK_MESSAGE, normalizeApiError, SERVER_MESSAGE, TIMEOUT_MESSAGE, UNREADABLE_MESSAGE } from "@/lib/api-error";

describe("normalizeApiError", () => {
  it("keeps the server's code, message, field errors and request id", () => {
    const error = normalizeApiError({
      status: 422,
      data: {
        success: false,
        statusCode: 422,
        errorCode: "VALIDATION_FAILED",
        message: "Please fix 2 fields and try again: email, name.",
        errors: [
          { field: "email", message: "Enter a valid email address." },
          { field: "name", message: "Enter the client's name." },
        ],
        requestId: "req-1",
      },
    });
    expect(error).toEqual({
      status: 422,
      errorCode: "VALIDATION_FAILED",
      message: "Please fix 2 fields and try again: email, name.",
      fieldErrors: [
        { field: "email", message: "Enter a valid email address." },
        { field: "name", message: "Enter the client's name." },
      ],
      requestId: "req-1",
    });
  });

  it("gives a network failure, a timeout and an unreadable body their own messages", () => {
    expect(normalizeApiError({ status: "FETCH_ERROR", error: "TypeError: Failed to fetch" })).toMatchObject({ errorCode: "NETWORK_ERROR", message: NETWORK_MESSAGE, status: 0 });
    expect(normalizeApiError({ status: "TIMEOUT_ERROR", error: "x" })).toMatchObject({ errorCode: "TIMEOUT", message: TIMEOUT_MESSAGE });
    expect(normalizeApiError({ status: "PARSING_ERROR", originalStatus: 200, data: "<html>", error: "SyntaxError" })).toMatchObject({ errorCode: "UNREADABLE_RESPONSE", message: UNREADABLE_MESSAGE });
  });

  it("never passes on HTML, stack traces or raw text from a body that is not ours", () => {
    const html = normalizeApiError({ status: 502, data: "<html><body>Bad gateway at nginx/1.2</body></html>" });
    expect(html.message).toBe(SERVER_MESSAGE);
    expect(html.message).not.toContain("nginx");
    expect(html.fieldErrors).toEqual([]);
    const text = normalizeApiError({ status: 400, data: "Error: boom\n    at handler (server.js:10:5)" });
    expect(text.message).toBe(UNREADABLE_MESSAGE);
    expect(text.message).not.toContain("server.js");
  });

  it("is safe on anything", () => {
    expect(normalizeApiError(undefined).message).toBe(SERVER_MESSAGE);
    expect(normalizeApiError(null).errorCode).toBe("UNKNOWN");
    expect(normalizeApiError("boom").errorCode).toBe("UNKNOWN");
  });

  it("returns an already normalized error unchanged", () => {
    const once = normalizeApiError({ status: 409, data: { success: false, statusCode: 409, errorCode: "CONCURRENT_MODIFICATION", message: "Changed." } });
    expect(normalizeApiError(once)).toBe(once);
  });
});
