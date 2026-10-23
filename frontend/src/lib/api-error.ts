import type { ApiError, ErrorEnvelope, FieldError } from "@/types/api";

/** Error codes the screens react to specially. The full list is in the backend's `error-codes.ts`. */
export const ErrorCodes = {
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  TOKEN_INVALID: "TOKEN_INVALID",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  CONCURRENT_MODIFICATION: "CONCURRENT_MODIFICATION",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
} as const;

export const NETWORK_MESSAGE = "We couldn't reach the server. Check your internet connection and try again.";
export const TIMEOUT_MESSAGE = "The server took too long to answer. Your change may not have been saved: refresh and check before trying again.";
export const UNREADABLE_MESSAGE = "The server sent an answer we couldn't read. Try again, and if it keeps happening, tell your administrator the time it occurred.";
export const SERVER_MESSAGE = "Something on our side went wrong. Your data is safe. Try again, and if it keeps happening, tell your administrator the time it occurred.";

/** Shape of the errors RTK Query's `fetchBaseQuery` produces, without importing its types into this module. */
interface FetchError {
  status?: number | "FETCH_ERROR" | "PARSING_ERROR" | "TIMEOUT_ERROR" | "CUSTOM_ERROR";
  data?: unknown;
  error?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isEnvelope(v: unknown): v is ErrorEnvelope {
  return isRecord(v) && v.success === false && typeof v.errorCode === "string" && typeof v.message === "string";
}

function fieldErrorsOf(v: unknown): FieldError[] {
  if (!Array.isArray(v)) return [];
  return v.filter((e): e is FieldError => isRecord(e) && typeof e.field === "string" && typeof e.message === "string");
}

/**
 * Turns anything a request can fail with into one shape. The server's standard envelope keeps its own message and field
 * errors. Network failures, timeouts and bodies that aren't the envelope (an HTML error page from a proxy, say) get a specific
 * message of ours: raw text, stack traces and HTML from the server are never passed on.
 */
export function normalizeApiError(error: unknown): ApiError {
  if (isRecord(error) && typeof error.errorCode === "string" && typeof error.message === "string" && Array.isArray(error.fieldErrors)) {
    return error as unknown as ApiError;
  }
  const e = (isRecord(error) ? error : {}) as unknown as FetchError;

  if (e.status === "FETCH_ERROR") return { status: 0, errorCode: "NETWORK_ERROR", message: NETWORK_MESSAGE, fieldErrors: [] };
  if (e.status === "TIMEOUT_ERROR") return { status: 0, errorCode: "TIMEOUT", message: TIMEOUT_MESSAGE, fieldErrors: [] };
  if (e.status === "PARSING_ERROR") return { status: 0, errorCode: "UNREADABLE_RESPONSE", message: UNREADABLE_MESSAGE, fieldErrors: [] };

  if (typeof e.status === "number") {
    if (isEnvelope(e.data)) {
      return {
        status: e.status,
        errorCode: e.data.errorCode,
        message: e.data.message,
        fieldErrors: fieldErrorsOf(e.data.errors),
        ...(e.data.requestId ? { requestId: e.data.requestId } : {}),
      };
    }
    // An HTTP error whose body isn't ours: a gateway page, an empty body, plain text.
    return {
      status: e.status,
      errorCode: e.status >= 500 ? "SERVER_ERROR" : "UNREADABLE_RESPONSE",
      message: e.status >= 500 ? SERVER_MESSAGE : UNREADABLE_MESSAGE,
      fieldErrors: [],
    };
  }
  return { status: 0, errorCode: "UNKNOWN", message: SERVER_MESSAGE, fieldErrors: [] };
}

export const isApiError = (v: unknown): v is ApiError =>
  isRecord(v) && typeof v.errorCode === "string" && typeof v.message === "string" && Array.isArray(v.fieldErrors) && typeof v.status === "number";
