import { mapNotification, type ApiNotification } from "@/lib/api-mappers";
import type { Cursored, CursorMeta } from "@/types/api";
import type { AppNotification } from "@/types/domain";
import { baseApi } from "./base";
import { params, toCursor, unwrap, type Env } from "./envelope";

export interface NotificationParams {
  unread?: boolean;
  /** Notification id to continue from (older ones). */
  before?: string;
  limit?: number;
}

export const notificationsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    notifications: build.query<Cursored<AppNotification>, NotificationParams | void>({
      query: (p) => ({ url: "/notifications", params: params({ ...(p ?? {}) }) }),
      transformResponse: (env: Env<ApiNotification[], CursorMeta>) => toCursor(env, mapNotification),
      providesTags: [{ type: "Notification", id: "LIST" }],
    }),
    unreadNotifications: build.query<number, void>({
      query: () => "/notifications/unread-count",
      transformResponse: (env: Env<{ unread: number }>) => unwrap(env).unread,
      providesTags: [{ type: "Notification", id: "COUNT" }],
    }),
    readNotification: build.mutation<unknown, string>({
      query: (id) => ({ url: `/notifications/${encodeURIComponent(id)}/read`, method: "POST" }),
      invalidatesTags: [{ type: "Notification", id: "LIST" }, { type: "Notification", id: "COUNT" }],
    }),
    readAllNotifications: build.mutation<{ updated: number }, void>({
      query: () => ({ url: "/notifications/read-all", method: "POST" }),
      transformResponse: (env: Env<{ updated: number }>) => unwrap(env),
      invalidatesTags: [{ type: "Notification", id: "LIST" }, { type: "Notification", id: "COUNT" }],
    }),
    deleteNotification: build.mutation<unknown, string>({
      query: (id) => ({ url: `/notifications/${encodeURIComponent(id)}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Notification", id: "LIST" }, { type: "Notification", id: "COUNT" }],
    }),
  }),
});

export const {
  useNotificationsQuery,
  useLazyNotificationsQuery,
  useUnreadNotificationsQuery,
  useReadNotificationMutation,
  useReadAllNotificationsMutation,
  useDeleteNotificationMutation,
} = notificationsApi;
