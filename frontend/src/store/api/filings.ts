import { mapCalendar, mapCaseOption, mapFiling, mapReminder, type ApiCalendarItem, type ApiFiling, type ApiReminder, type CaseOption, type Calendar } from "@/lib/api-mappers";
import type { PageMeta, Paged } from "@/types/api";
import type { Filing, Reminder } from "@/types/domain";
import { baseApi } from "./base";
import { params, toPage, unwrap, type Env } from "./envelope";

export interface ListFilingsParams {
  /** An API status key: NOT_SUBMITTED, SUBMITTED, PENDING_STATE_REVIEW, APPROVED, REJECTED. */
  status?: string;
  nextActionFrom?: string;
  nextActionTo?: string;
  caseId?: string;
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface FilingInput {
  type?: string;
  status?: string;
  /** On an update, null clears the date. */
  submittedOn?: string | null;
  reference?: string;
  nextAction?: string;
  nextActionDate?: string | null;
  outcome?: string;
  /** Required from Admin and Manager to move a status backwards. */
  reason?: string;
}

export const filingsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    filings: build.query<Paged<Filing>, ListFilingsParams | void>({
      query: (p) => ({ url: "/filings", params: params({ ...(p ?? {}) }) }),
      transformResponse: (env: Env<ApiFiling[], PageMeta>) => toPage(env, mapFiling),
      providesTags: (r) => [{ type: "Filing", id: "LIST" }, ...(r?.items ?? []).map((f) => ({ type: "Filing" as const, id: f.id }))],
    }),
    /** How many filings are in a status (the tiles above the table): a one-row query reading only the total. */
    filingCount: build.query<number, string>({
      query: (status) => ({ url: "/filings", params: { status, limit: 1 } }),
      transformResponse: (env: Env<ApiFiling[], PageMeta>) => env.meta?.total ?? 0,
      providesTags: [{ type: "Filing", id: "LIST" }],
    }),
    filingsForCase: build.query<Paged<Filing>, { caseId: string; page?: number; limit?: number }>({
      query: ({ caseId, ...p }) => ({ url: `/cases/${encodeURIComponent(caseId)}/filings`, params: params({ ...p }) }),
      transformResponse: (env: Env<ApiFiling[], PageMeta>) => toPage(env, mapFiling),
      providesTags: (r, _e, a) => [{ type: "Filing", id: "LIST" }, { type: "Filing", id: `case:${a.caseId}` }, ...(r?.items ?? []).map((f) => ({ type: "Filing" as const, id: f.id }))],
    }),
    createFiling: build.mutation<Filing, { caseId: string; type: string } & FilingInput>({
      query: (body) => ({ url: "/filings", method: "POST", body }),
      transformResponse: (env: Env<ApiFiling>) => mapFiling(unwrap(env)),
      invalidatesTags: [{ type: "Filing", id: "LIST" }, "Dashboard", "Audit"],
    }),
    updateFiling: build.mutation<Filing, { id: string } & FilingInput>({
      query: ({ id, ...body }) => ({ url: `/filings/${encodeURIComponent(id)}`, method: "PATCH", body }),
      transformResponse: (env: Env<ApiFiling>) => mapFiling(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Filing", id }, { type: "Filing", id: "LIST" }, "Dashboard", "Audit"],
    }),

    /** Cases to choose from when adding a filing (the ones the caller can see, most recently active first). */
    caseOptions: build.query<CaseOption[], void>({
      query: () => ({ url: "/cases", params: { limit: 100, sort: "lastActivityAt", order: "desc" } }),
      transformResponse: (env: Env<Array<{ id: string; displayNumber: string; client: { name: string } }>>) => unwrap(env).map(mapCaseOption),
      providesTags: [{ type: "Case", id: "LIST" }],
    }),

    // ---- reminders (illustrative, never legal deadlines) -------------------------------------------------------
    caseReminders: build.query<Paged<Reminder>, { caseId: string; caseDisplay?: string; page?: number; limit?: number }>({
      query: ({ caseId, page, limit }) => ({ url: `/cases/${encodeURIComponent(caseId)}/reminders`, params: params({ page, limit }) }),
      transformResponse: (env: Env<ApiReminder[], PageMeta>, _m, arg) => toPage(env, (r) => mapReminder(r, arg.caseId, arg.caseDisplay)),
      providesTags: (_r, _e, a) => [{ type: "Reminder", id: `case:${a.caseId}` }],
    }),
    addReminder: build.mutation<Reminder, { caseId: string; caseDisplay?: string; title: string; date: string; kind: string }>({
      query: ({ caseId, title, date, kind }) => ({ url: `/cases/${encodeURIComponent(caseId)}/reminders`, method: "POST", body: { title, date, kind } }),
      transformResponse: (env: Env<ApiReminder>, _m, arg) => mapReminder(unwrap(env), arg.caseId, arg.caseDisplay),
      invalidatesTags: (_r, _e, a) => [{ type: "Reminder", id: `case:${a.caseId}` }, { type: "Reminder", id: "CALENDAR" }, "Audit"],
    }),
    removeReminder: build.mutation<Reminder, { caseId: string; id: string }>({
      query: ({ caseId, id }) => ({ url: `/cases/${encodeURIComponent(caseId)}/reminders/${encodeURIComponent(id)}`, method: "DELETE" }),
      transformResponse: (env: Env<ApiReminder>, _m, arg) => mapReminder(unwrap(env), arg.caseId),
      invalidatesTags: (_r, _e, a) => [{ type: "Reminder", id: `case:${a.caseId}` }, { type: "Reminder", id: "CALENDAR" }, "Audit"],
    }),

    // ---- the compliance calendar -------------------------------------------------------------------------------
    calendar: build.query<Calendar, { from: string; to: string }>({
      query: (p) => ({ url: "/calendar", params: p }),
      transformResponse: (env: Env<{ items: ApiCalendarItem[]; overdueTotal: number; truncated: boolean }>) => mapCalendar(unwrap(env)),
      providesTags: ["Case", "Task", "Document", { type: "Filing", id: "LIST" }, { type: "Reminder", id: "CALENDAR" }],
    }),
  }),
});

export const {
  useFilingsQuery,
  useFilingCountQuery,
  useFilingsForCaseQuery,
  useCaseOptionsQuery,
  useCreateFilingMutation,
  useUpdateFilingMutation,
  useCaseRemindersQuery,
  useAddReminderMutation,
  useRemoveReminderMutation,
  useCalendarQuery,
} = filingsApi;
