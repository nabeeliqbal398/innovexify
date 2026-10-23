import { mapAckList, mapAnnouncement, type ApiAckList, type ApiAnnouncement } from "@/lib/api-mappers";
import type { PageMeta, Paged } from "@/types/api";
import type { Announcement, AnnouncementAcks } from "@/types/domain";
import { baseApi } from "./base";
import { params, toPage, unwrap, type Env } from "./envelope";

export interface ListAnnouncementsParams {
  status?: string;
  audience?: string;
  priority?: string;
  page?: number;
  limit?: number;
}

export interface AnnouncementInput {
  title: string;
  message: string;
  /** "all" or a client id. */
  audience?: string;
  priority?: string;
  expiresAt?: string | null;
  requireAck?: boolean;
}

export const announcementsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    announcements: build.query<Paged<Announcement>, ListAnnouncementsParams | void>({
      query: (p) => ({ url: "/announcements", params: params({ ...(p ?? {}) }) }),
      transformResponse: (env: Env<ApiAnnouncement[], PageMeta>) => toPage(env, mapAnnouncement),
      providesTags: (r) => [{ type: "Announcement", id: "LIST" }, ...(r?.items ?? []).map((a) => ({ type: "Announcement" as const, id: a.id }))],
    }),
    announcement: build.query<Announcement, string>({
      query: (id) => `/announcements/${encodeURIComponent(id)}`,
      transformResponse: (env: Env<ApiAnnouncement>) => mapAnnouncement(unwrap(env)),
      providesTags: (_r, _e, id) => [{ type: "Announcement", id }],
    }),
    createAnnouncement: build.mutation<Announcement, AnnouncementInput & { publish: boolean }>({
      query: (body) => ({ url: "/announcements", method: "POST", body }),
      transformResponse: (env: Env<ApiAnnouncement>) => mapAnnouncement(unwrap(env)),
      invalidatesTags: [{ type: "Announcement", id: "LIST" }, "Notification", "Dashboard"],
    }),
    updateAnnouncement: build.mutation<Announcement, { id: string } & Partial<AnnouncementInput>>({
      query: ({ id, ...body }) => ({ url: `/announcements/${encodeURIComponent(id)}`, method: "PATCH", body }),
      transformResponse: (env: Env<ApiAnnouncement>) => mapAnnouncement(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Announcement", id }, { type: "Announcement", id: "LIST" }],
    }),
    publishAnnouncement: build.mutation<Announcement, string>({
      query: (id) => ({ url: `/announcements/${encodeURIComponent(id)}/publish`, method: "POST" }),
      transformResponse: (env: Env<ApiAnnouncement>) => mapAnnouncement(unwrap(env)),
      invalidatesTags: (_r, _e, id) => [{ type: "Announcement", id }, { type: "Announcement", id: "LIST" }, "Notification"],
    }),
    archiveAnnouncement: build.mutation<Announcement, string>({
      query: (id) => ({ url: `/announcements/${encodeURIComponent(id)}/archive`, method: "POST" }),
      transformResponse: (env: Env<ApiAnnouncement>) => mapAnnouncement(unwrap(env)),
      invalidatesTags: (_r, _e, id) => [{ type: "Announcement", id }, { type: "Announcement", id: "LIST" }],
    }),
    acknowledgeAnnouncement: build.mutation<Announcement, string>({
      query: (id) => ({ url: `/announcements/${encodeURIComponent(id)}/ack`, method: "POST" }),
      transformResponse: (env: Env<ApiAnnouncement>) => mapAnnouncement(unwrap(env)),
      invalidatesTags: (_r, _e, id) => [{ type: "Announcement", id }, { type: "Announcement", id: "LIST" }],
    }),
    announcementAcks: build.query<AnnouncementAcks, string>({
      query: (id) => `/announcements/${encodeURIComponent(id)}/acks`,
      transformResponse: (env: Env<ApiAckList>) => mapAckList(unwrap(env)),
      providesTags: (_r, _e, id) => [{ type: "Announcement", id }],
    }),
  }),
});

export const {
  useAnnouncementsQuery,
  useAnnouncementQuery,
  useCreateAnnouncementMutation,
  useUpdateAnnouncementMutation,
  usePublishAnnouncementMutation,
  useArchiveAnnouncementMutation,
  useAcknowledgeAnnouncementMutation,
  useAnnouncementAcksQuery,
} = announcementsApi;
