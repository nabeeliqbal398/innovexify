import { filenameFromDisposition, holdBlob, type DownloadSummary } from "@/lib/download";
import { mapConversation, mapMessage, type ApiConversation, type ApiMessage } from "@/lib/api-mappers";
import type { Cursored, CursorMeta, PageMeta, Paged } from "@/types/api";
import type { Conversation, Message } from "@/types/domain";
import { baseApi } from "./base";
import { params, toCursor, toPage, unwrap, type Env } from "./envelope";

export interface ThreadPageArgs {
  clientId: string;
  /** Older than this message id. */
  before?: string;
  /** Newer than this message id (polling). */
  since?: string;
  limit?: number;
}

export interface SendMessageArgs {
  clientId: string;
  text: string;
  file?: File | null;
}

export const messagesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    conversations: build.query<Paged<Conversation>, { page?: number; limit?: number } | void>({
      query: (p) => ({ url: "/conversations", params: params({ ...(p ?? {}) }) }),
      transformResponse: (env: Env<ApiConversation[], PageMeta>) => toPage(env, mapConversation),
      providesTags: [{ type: "Conversation", id: "LIST" }],
    }),
    /**
     * One page of a thread. The thread screen keeps its own list (newest page first, older pages added above, new messages
     * appended by polling), so a page is fetched fresh each time and not cached.
     */
    threadPage: build.query<Cursored<Message>, ThreadPageArgs>({
      query: ({ clientId, ...rest }) => ({ url: `/clients/${encodeURIComponent(clientId)}/messages`, params: params({ ...rest }) }),
      transformResponse: (env: Env<ApiMessage[], CursorMeta>) => toCursor(env, mapMessage),
      keepUnusedDataFor: 0,
    }),
    unreadCount: build.query<number, void>({
      query: () => "/messages/unread-count",
      transformResponse: (env: Env<{ unread: number }>) => unwrap(env).unread,
      providesTags: ["Message"],
    }),
    sendMessage: build.mutation<Message, SendMessageArgs>({
      query: ({ clientId, text, file }) => {
        const url = `/clients/${encodeURIComponent(clientId)}/messages`;
        if (!file) return { url, method: "POST", body: { text } };
        const body = new FormData();
        body.append("text", text);
        body.append("file", file);
        return { url, method: "POST", body };
      },
      transformResponse: (env: Env<ApiMessage>) => mapMessage(unwrap(env)),
      invalidatesTags: [{ type: "Conversation", id: "LIST" }, "Message", "Dashboard"],
    }),
    markRead: build.mutation<{ unread: number }, string>({
      query: (clientId) => ({ url: `/clients/${encodeURIComponent(clientId)}/messages/read`, method: "POST" }),
      transformResponse: (env: Env<{ unread: number }>) => unwrap(env),
      invalidatesTags: [{ type: "Conversation", id: "LIST" }, "Message"],
    }),
    /** The attachment through the authenticated route; the bytes wait outside Redux until the screen takes them (see `takeBlob`). */
    downloadAttachment: build.mutation<DownloadSummary, string>({
      query: (messageId) => `/messages/${encodeURIComponent(messageId)}/attachment`,
      transformResponse: (blob: Blob, meta) => ({
        key: holdBlob(blob),
        filename: filenameFromDisposition((meta as { response?: Response } | undefined)?.response?.headers.get("content-disposition")),
        mimeType: blob.type || "application/octet-stream",
      }),
      invalidatesTags: ["Audit"],
    }),
  }),
});

export const {
  useConversationsQuery,
  useThreadPageQuery,
  useUnreadCountQuery,
  useSendMessageMutation,
  useMarkReadMutation,
  useDownloadAttachmentMutation,
} = messagesApi;
