import { mapMe, mapPrefs, type ApiMe, type ApiPreference } from "@/lib/api-mappers";
import type { NotificationPrefs, User } from "@/types/domain";
import { baseApi } from "./base";
import { unwrap, type Env } from "./envelope";

interface ApiSession {
  accessToken: string;
  expiresIn: number;
}

export interface InvitationLookup {
  email: string;
  name: string;
  role: string;
  caseNumber: string | null;
  invitedBy: string | null;
  expiresAt: string;
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Trade the refresh cookie for a new access token. Used once at start-up; later refreshes happen inside the base query. */
    refresh: build.mutation<ApiSession, void>({
      query: () => ({ url: "/auth/refresh", method: "POST" }),
      transformResponse: (env: Env<ApiSession>) => unwrap(env),
    }),
    login: build.mutation<ApiSession, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      transformResponse: (env: Env<ApiSession>) => unwrap(env),
    }),
    me: build.query<User, void>({
      query: () => "/auth/me",
      transformResponse: (env: Env<ApiMe>) => mapMe(unwrap(env)),
      providesTags: ["Me"],
    }),
    logout: build.mutation<null, void>({
      query: () => ({ url: "/auth/logout", method: "POST" }),
    }),
    logoutAll: build.mutation<{ sessionsEnded: number }, void>({
      query: () => ({ url: "/auth/logout-all", method: "POST" }),
      transformResponse: (env: Env<{ sessionsEnded: number }>) => unwrap(env),
    }),
    changePassword: build.mutation<{ otherSessionsEnded: number }, { currentPassword: string; newPassword: string }>({
      query: (body) => ({ url: "/auth/change-password", method: "POST", body }),
      transformResponse: (env: Env<{ otherSessionsEnded: number }>) => unwrap(env),
    }),
    invitation: build.query<InvitationLookup, string>({
      query: (token) => `/auth/invitations/${encodeURIComponent(token)}`,
      transformResponse: (env: Env<InvitationLookup>) => unwrap(env),
    }),
    acceptInvitation: build.mutation<ApiSession, { token: string; password: string }>({
      query: (body) => ({ url: "/auth/accept-invitation", method: "POST", body }),
      transformResponse: (env: Env<ApiSession>) => unwrap(env),
    }),
    preferences: build.query<NotificationPrefs, void>({
      query: () => "/users/me/notification-preferences",
      transformResponse: (env: Env<ApiPreference[]>) => mapPrefs(unwrap(env)),
      providesTags: ["Prefs"],
    }),
    updatePreference: build.mutation<NotificationPrefs, { category: ApiPreference["category"]; email?: boolean; inApp?: boolean }>({
      query: (change) => ({ url: "/users/me/notification-preferences", method: "PATCH", body: { preferences: [change] } }),
      transformResponse: (env: Env<ApiPreference[]>) => mapPrefs(unwrap(env)),
      invalidatesTags: ["Prefs"],
    }),
  }),
});

export const {
  useRefreshMutation,
  useLoginMutation,
  useMeQuery,
  useLogoutMutation,
  useLogoutAllMutation,
  useChangePasswordMutation,
  useInvitationQuery,
  useAcceptInvitationMutation,
  usePreferencesQuery,
  useUpdatePreferenceMutation,
} = authApi;
