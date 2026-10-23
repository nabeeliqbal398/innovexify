import { createApi, fetchBaseQuery, type BaseQueryFn, type FetchArgs } from "@reduxjs/toolkit/query/react";

import { ErrorCodes, normalizeApiError } from "@/lib/api-error";
import { sessionActions } from "@/store/sessionSlice";
import type { RootState } from "@/store";
import type { ApiError, SuccessEnvelope } from "@/types/api";
import type { User } from "@/types/domain";

export const API_BASE = "/api/v1";
export const REQUEST_TIMEOUT_MS = 15_000;
export const SESSION_ENDED_MESSAGE = "Your session ended. Sign in again to continue.";

/** Read the body the way the server meant it: JSON when it is JSON, a blob for files, text otherwise (never trusted as markup). */
const responseHandler = async (response: Response): Promise<unknown> => {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return response.json();
  if (response.ok) return response.blob();
  return response.text();
};

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE,
  credentials: "include",
  timeout: REQUEST_TIMEOUT_MS,
  responseHandler,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).session.accessToken;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});

export type ApiBaseQuery = BaseQueryFn<string | FetchArgs, unknown, ApiError, object, { response?: Response }>;

/** One refresh at a time, however many requests failed together. Everyone waits for the same answer. */
let refreshInFlight: Promise<RefreshOutcome> | null = null;
type RefreshOutcome = { ok: true } | { ok: false; error: ApiError; ended: boolean };

/** Exposed for tests: forget a refresh that never settled. */
export function resetRefreshState(): void {
  refreshInFlight = null;
}

/** The session the cookie stands for: a new access token, then who it is. */
async function startSessionFromCookie(api: Parameters<ApiBaseQuery>[1], extra: Parameters<ApiBaseQuery>[2]): Promise<RefreshOutcome> {
  const refreshed = await rawBaseQuery({ url: "/auth/refresh", method: "POST" }, api, extra);
  if (refreshed.error) {
    const error = normalizeApiError(refreshed.error);
    // An answer from the server saying no means the session is over; a dropped connection or a 5xx says nothing about it.
    return { ok: false, error, ended: error.status >= 400 && error.status < 500 };
  }
  const token = ((refreshed.data as SuccessEnvelope<{ accessToken: string }> | undefined)?.data ?? { accessToken: "" }).accessToken;
  if (!token) return { ok: false, error: normalizeApiError({ status: "PARSING_ERROR", error: "no token" }), ended: false };
  api.dispatch(sessionActions.tokenSet(token));
  return { ok: true };
}

function refreshOnce(api: Parameters<ApiBaseQuery>[1], extra: Parameters<ApiBaseQuery>[2]): Promise<RefreshOutcome> {
  refreshInFlight ??= startSessionFromCookie(api, extra).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

const NO_REFRESH_URLS = ["/auth/login", "/auth/refresh", "/auth/logout", "/auth/accept-invitation"];
const urlOf = (args: string | FetchArgs): string => (typeof args === "string" ? args : args.url);

/**
 * The only door to the API. It attaches the in-memory access token; when the server says the token is missing or expired
 * it runs ONE refresh (shared by every request that failed at the same time), retries the original request ONCE, and if the
 * refresh is refused it ends the session and clears every cached answer. It never retries more than once, so it cannot loop.
 */
export const baseQueryWithReauth: ApiBaseQuery = async (args, api, extra) => {
  const tokenUsed = (api.getState() as RootState).session.accessToken;
  let result = await rawBaseQuery(args, api, extra);

  const first = result.error ? normalizeApiError(result.error) : null;
  const refreshable =
    first?.status === 401 &&
    (first.errorCode === ErrorCodes.TOKEN_EXPIRED || first.errorCode === ErrorCodes.UNAUTHENTICATED || first.errorCode === ErrorCodes.TOKEN_INVALID) &&
    !NO_REFRESH_URLS.includes(urlOf(args));

  if (refreshable) {
    const current = (api.getState() as RootState).session.accessToken;
    // Another request may have refreshed while this one was in flight: then just use the newer token.
    const alreadyRefreshed = current !== null && current !== tokenUsed;
    const outcome: RefreshOutcome = alreadyRefreshed ? { ok: true } : await refreshOnce(api, extra);
    if (!outcome.ok) {
      if (outcome.ended) {
        api.dispatch(sessionActions.ended(SESSION_ENDED_MESSAGE));
        api.dispatch(baseApi.util.resetApiState());
      }
      return { error: outcome.ended ? { ...(first as ApiError), message: SESSION_ENDED_MESSAGE } : outcome.error };
    }
    result = await rawBaseQuery(args, api, extra); // the single retry
  }

  if (result.error) return { error: normalizeApiError(result.error), meta: result.meta as { response?: Response } | undefined };
  return { data: result.data, meta: result.meta as { response?: Response } | undefined };
};

export const TAGS = [
  "Me",
  "User",
  "Client",
  "Case",
  "Task",
  "FollowUp",
  "Interaction",
  "Document",
  "Filing",
  "Reminder",
  "Report",
  "Message",
  "Conversation",
  "Announcement",
  "Ticket",
  "Notification",
  "Dashboard",
  "Analytics",
  "Company",
  "Service",
  "Trigger",
  "Audit",
  "Prefs",
] as const;
export type Tag = (typeof TAGS)[number];

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: TAGS,
  endpoints: () => ({}),
});

/** Start a session from the refresh cookie (page load). Used by the session bootstrap, outside any one request. */
export type SessionUser = User;
