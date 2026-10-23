import { mapReport, type ApiReport } from "@/lib/api-mappers";
import type { PageMeta, Paged } from "@/types/api";
import type { Report } from "@/types/domain";
import { baseApi } from "./base";
import { params, toPage, unwrap, type Env } from "./envelope";

export interface ListReportsParams {
  /** An API status key: SUBMITTED, ACKNOWLEDGED, CLARIFICATION_REQUESTED, REVIEWED. */
  status?: string;
  priority?: string;
  category?: string;
  clientId?: string;
  csrId?: string;
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface NewReportInput {
  clientId: string;
  title: string;
  body: string;
  category?: string;
  priority?: string;
  action?: string;
  caseId?: string;
}

const changed = (id: string) => [{ type: "Report" as const, id }, { type: "Report" as const, id: "LIST" }, "Dashboard" as const, "Notification" as const];

export const reportsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    reports: build.query<Paged<Report>, ListReportsParams | void>({
      query: (p) => ({ url: "/reports", params: params({ ...(p ?? {}) }) }),
      transformResponse: (env: Env<ApiReport[], PageMeta>) => toPage(env, mapReport),
      providesTags: (r) => [{ type: "Report", id: "LIST" }, ...(r?.items ?? []).map((x) => ({ type: "Report" as const, id: x.id }))],
    }),
    /** One report with its thread (Compliance notes are only in the answer for people who may read them). */
    report: build.query<Report, string>({
      query: (id) => `/reports/${encodeURIComponent(id)}`,
      transformResponse: (env: Env<ApiReport>) => mapReport(unwrap(env)),
      providesTags: (_r, _e, id) => [{ type: "Report", id }],
    }),
    /** How many reports are in a status, for the filter chips. */
    reportCount: build.query<number, string>({
      query: (status) => ({ url: "/reports", params: params({ status, limit: 1 }) }),
      transformResponse: (env: Env<ApiReport[], PageMeta>) => env.meta?.total ?? 0,
      providesTags: [{ type: "Report", id: "LIST" }],
    }),
    submitReport: build.mutation<Report, NewReportInput>({
      query: (body) => ({ url: "/reports", method: "POST", body }),
      transformResponse: (env: Env<ApiReport>) => mapReport(unwrap(env)),
      invalidatesTags: [{ type: "Report", id: "LIST" }, "Dashboard", "Audit"],
    }),
    replyReport: build.mutation<unknown, { id: string; text: string }>({
      query: ({ id, text }) => ({ url: `/reports/${encodeURIComponent(id)}/messages`, method: "POST", body: { text } }),
      invalidatesTags: (_r, _e, { id }) => changed(id),
    }),
    addReportNote: build.mutation<unknown, { id: string; text: string }>({
      query: ({ id, text }) => ({ url: `/reports/${encodeURIComponent(id)}/notes`, method: "POST", body: { text } }),
      invalidatesTags: (_r, _e, { id }) => changed(id),
    }),
    setReportStatus: build.mutation<Report, { id: string; status: "ACKNOWLEDGED" | "CLARIFICATION_REQUESTED" | "REVIEWED" }>({
      query: ({ id, status }) => ({ url: `/reports/${encodeURIComponent(id)}/status`, method: "POST", body: { status } }),
      transformResponse: (env: Env<ApiReport>) => mapReport(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => changed(id),
    }),
  }),
});

export const {
  useReportsQuery,
  useReportQuery,
  useReportCountQuery,
  useSubmitReportMutation,
  useReplyReportMutation,
  useAddReportNoteMutation,
  useSetReportStatusMutation,
} = reportsApi;
