import { mapTicket, mapTicketMessage, type ApiTicket, type ApiTicketMessage } from "@/lib/api-mappers";
import type { PageMeta, Paged } from "@/types/api";
import type { Ticket, TicketThreadMsg } from "@/types/domain";
import { baseApi } from "./base";
import { params, toPage, unwrap, type Env } from "./envelope";

export interface ListTicketsParams {
  status?: string;
  /** active: not yet resolved or closed. finished: resolved or closed. */
  group?: "active" | "finished";
  priority?: string;
  category?: string;
  /** A staff id, or "none" for unassigned. */
  handlerId?: string;
  clientId?: string;
  escalated?: boolean;
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface NewTicketInput {
  title: string;
  description: string;
  category: string;
  priority?: string;
  caseId?: string;
  /** Staff opening a ticket for a client. */
  clientId?: string;
}

const touched = (id: string) => [{ type: "Ticket" as const, id }, { type: "Ticket" as const, id: "LIST" }, "Dashboard" as const, "Notification" as const];

export const ticketsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    tickets: build.query<Paged<Ticket>, ListTicketsParams | void>({
      query: (p) => ({ url: "/tickets", params: params({ ...(p ?? {}) }) }),
      transformResponse: (env: Env<ApiTicket[], PageMeta>) => toPage(env, mapTicket),
      providesTags: (r) => [{ type: "Ticket", id: "LIST" }, ...(r?.items ?? []).map((t) => ({ type: "Ticket" as const, id: t.id }))],
    }),
    /** `id` may be the API id or the TKT-n number. */
    ticket: build.query<Ticket, string>({
      query: (id) => `/tickets/${encodeURIComponent(id)}`,
      transformResponse: (env: Env<ApiTicket>) => mapTicket(unwrap(env)),
      providesTags: (r, _e, id) => [{ type: "Ticket", id }, ...(r ? [{ type: "Ticket" as const, id: r.id }] : [])],
    }),
    createTicket: build.mutation<Ticket, NewTicketInput>({
      query: (body) => ({ url: "/tickets", method: "POST", body }),
      transformResponse: (env: Env<ApiTicket>) => mapTicket(unwrap(env)),
      invalidatesTags: [{ type: "Ticket", id: "LIST" }, "Dashboard", "Notification"],
    }),
    replyTicket: build.mutation<TicketThreadMsg, { id: string; text: string; internal?: boolean }>({
      query: ({ id, ...body }) => ({ url: `/tickets/${encodeURIComponent(id)}/messages`, method: "POST", body }),
      transformResponse: (env: Env<ApiTicketMessage>) => mapTicketMessage(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => touched(id),
    }),
    changeTicketStatus: build.mutation<Ticket, { id: string; status: string; version: number; note?: string }>({
      query: ({ id, ...body }) => ({ url: `/tickets/${encodeURIComponent(id)}/status`, method: "POST", body }),
      transformResponse: (env: Env<ApiTicket>) => mapTicket(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => touched(id),
    }),
    assignTicket: build.mutation<Ticket, { id: string; version: number; handlerId?: string }>({
      query: ({ id, ...body }) => ({ url: `/tickets/${encodeURIComponent(id)}/assign`, method: "POST", body }),
      transformResponse: (env: Env<ApiTicket>) => mapTicket(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => touched(id),
    }),
    escalateTicket: build.mutation<Ticket, { id: string; version: number; escalated: boolean }>({
      query: ({ id, ...body }) => ({ url: `/tickets/${encodeURIComponent(id)}/escalate`, method: "POST", body }),
      transformResponse: (env: Env<ApiTicket>) => mapTicket(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => touched(id),
    }),
    resolveTicket: build.mutation<Ticket, { id: string; version: number; resolutionNote: string }>({
      query: ({ id, ...body }) => ({ url: `/tickets/${encodeURIComponent(id)}/resolve`, method: "POST", body }),
      transformResponse: (env: Env<ApiTicket>) => mapTicket(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => touched(id),
    }),
    closeTicket: build.mutation<Ticket, { id: string; version: number }>({
      query: ({ id, ...body }) => ({ url: `/tickets/${encodeURIComponent(id)}/close`, method: "POST", body }),
      transformResponse: (env: Env<ApiTicket>) => mapTicket(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => touched(id),
    }),
  }),
});

export const {
  useTicketsQuery,
  useTicketQuery,
  useCreateTicketMutation,
  useReplyTicketMutation,
  useChangeTicketStatusMutation,
  useAssignTicketMutation,
  useEscalateTicketMutation,
  useResolveTicketMutation,
  useCloseTicketMutation,
} = ticketsApi;
