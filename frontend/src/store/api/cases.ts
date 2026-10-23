import {
  mapCase,
  mapFollowUp,
  mapInteraction,
  mapRecentInteraction,
  mapCaseNote,
  mapTask,
  mapTimelineEntry,
  type ApiCase,
  type ApiFollowUp,
  type ApiInteraction,
  type ApiRecentInteraction,
  type RecentInteraction,
  type ApiTask,
  type ApiTimelineEntry,
  type TimelineEntry,
} from "@/lib/api-mappers";
import { mapCaseSide, type ApiCaseDocument, type ApiCaseFiling, type ApiCaseMessage, type CaseDocument, type CaseFiling, type CaseMessage } from "@/lib/mappers/case-side";
import type { PageMeta, Paged } from "@/types/api";
import type { CaseNote, FollowUp, Interaction, Project, Task } from "@/types/domain";
import { baseApi } from "./base";
import { params, toPage, unwrap, type Env } from "./envelope";

export interface ListCasesParams {
  search?: string;
  /** Enum keys (DOCUMENTS_PENDING), not labels. */
  stage?: string;
  status?: string;
  priority?: string;
  /** The client's CSR id, or "none". */
  csrId?: string;
  state?: string;
  overdue?: boolean;
  openedFrom?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  ownerId?: string;
  clientId?: string;
  serviceId?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface ListTasksParams {
  caseId?: string;
  assigneeId?: string;
  type?: string;
  priority?: string;
  done?: boolean;
  filter?: "overdue" | "today" | "week" | "upcoming" | "mine";
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface ListFollowUpsParams {
  csrId?: string;
  clientId?: string;
  status?: "OPEN" | "DONE";
  filter?: "overdue" | "today" | "upcoming";
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface NewCaseInput {
  clientId: string;
  serviceId: string;
  priority?: string;
  deadline: string;
  businessName?: string;
  formationState?: string;
}

export interface CaseChanges {
  version: number;
  priority?: string;
  deadline?: string | null;
  ownerId?: string | null;
  serviceId?: string;
  status?: string;
}

export interface NewTaskInput {
  caseId: string;
  title: string;
  assigneeId?: string;
  priority?: string;
  due?: string;
  visibility?: string;
}

export interface TaskChanges {
  title?: string;
  due?: string;
  priority?: string;
  assigneeId?: string;
  visibility?: string;
}

export interface FilingInput {
  caseId?: string;
  type: string;
  status: string;
  submittedOn?: string;
  reference?: string;
  nextAction?: string;
  nextActionDate?: string;
  reason?: string;
}


/**
 * After an edit or a stage move the server's answer carries the new version. Put it (and the fields the edit touches) into the open
 * case right away, so a second change made before the refetch finishes is sent with the current version and is not mistaken for a conflict.
 */
async function applyToCase(
  id: string,
  dispatch: (action: never) => unknown,
  queryFulfilled: Promise<{ data: Project }>,
): Promise<void> {
  try {
    const { data } = await queryFulfilled;
    const patch = (draft: Project): void => {
      Object.assign(draft, {
        version: data.version,
        stageIdx: data.stageIdx,
        status: data.status,
        filing: data.filing,
        priority: data.priority,
        deadline: data.deadline,
        owner: data.owner,
        ownerName: data.ownerName,
        service: data.service,
        serviceName: data.serviceName,
        completedAt: data.completedAt,
        last: data.last,
      });
    };
    dispatch(baseApi.util.updateQueryData("case" as never, id as never, patch as never) as never);
  } catch {
    // A refused change leaves the page as it was; the error is shown by the caller.
  }
}

export const casesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ---- cases ------------------------------------------------------------------------------------------------
    cases: build.query<Paged<Project>, ListCasesParams | void>({
      query: (p) => ({ url: "/cases", params: params({ ...(p ?? {}) }) }),
      transformResponse: (env: Env<ApiCase[], PageMeta>) => toPage(env, mapCase),
      providesTags: (r) => [{ type: "Case", id: "LIST" }, ...(r?.items ?? []).map((c) => ({ type: "Case" as const, id: c.apiId }))],
    }),
    case: build.query<Project, string>({
      query: (id) => `/cases/${encodeURIComponent(id)}`,
      transformResponse: (env: Env<ApiCase>) => mapCase(unwrap(env)),
      providesTags: (_r, _e, id) => [{ type: "Case", id }],
    }),
    createCase: build.mutation<Project, NewCaseInput>({
      query: (body) => ({ url: "/cases", method: "POST", body }),
      transformResponse: (env: Env<ApiCase>) => mapCase(unwrap(env)),
      invalidatesTags: [{ type: "Case", id: "LIST" }, { type: "Client", id: "LIST" }, "Dashboard"],
    }),
    updateCase: build.mutation<Project, { id: string } & CaseChanges>({
      query: ({ id, ...body }) => ({ url: `/cases/${encodeURIComponent(id)}`, method: "PATCH", body }),
      transformResponse: (env: Env<ApiCase>) => mapCase(unwrap(env)),
      onQueryStarted: ({ id }, { dispatch, queryFulfilled }) => applyToCase(id, dispatch as never, queryFulfilled),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Case", id }, { type: "Case", id: "LIST" }, { type: "Client", id: "LIST" }, "Dashboard"],
    }),
    moveStage: build.mutation<Project, { id: string; targetStage: string; version: number; filingConfirmation?: string; note?: string }>({
      query: ({ id, ...body }) => ({ url: `/cases/${encodeURIComponent(id)}/stage`, method: "POST", body }),
      transformResponse: (env: Env<ApiCase>) => mapCase(unwrap(env)),
      onQueryStarted: ({ id }, { dispatch, queryFulfilled }) => applyToCase(id, dispatch as never, queryFulfilled),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Case", id }, { type: "Case", id: "LIST" }, { type: "Client", id: "LIST" }, "Dashboard", "Notification"],
    }),
    addCaseNote: build.mutation<CaseNote, { id: string; text: string; visibility: "STAFF" | "COMPLIANCE" }>({
      query: ({ id, ...body }) => ({ url: `/cases/${encodeURIComponent(id)}/notes`, method: "POST", body }),
      transformResponse: (env: Env<Parameters<typeof mapCaseNote>[0]>) => mapCaseNote(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Case", id }],
    }),
    clientTimeline: build.query<TimelineEntry[], { clientId: string; relationship?: boolean; limit?: number }>({
      query: ({ clientId, ...p }) => ({ url: `/clients/${encodeURIComponent(clientId)}/timeline`, params: params({ ...p }) }),
      transformResponse: (env: Env<ApiTimelineEntry[]>) => unwrap(env).map(mapTimelineEntry),
      providesTags: (_r, _e, { clientId }) => [{ type: "Client", id: clientId }, "Case", "Document", "Ticket", "Message", "FollowUp", "Interaction"],
    }),

    // ---- tasks ------------------------------------------------------------------------------------------------
    tasks: build.query<Paged<Task>, ListTasksParams | void>({
      query: (p) => ({ url: "/tasks", params: params({ ...(p ?? {}) }) }),
      transformResponse: (env: Env<ApiTask[], PageMeta>) => toPage(env, mapTask),
      providesTags: (r) => [{ type: "Task", id: "LIST" }, ...(r?.items ?? []).map((t) => ({ type: "Task" as const, id: t.id }))],
    }),
    task: build.query<Task, string>({
      query: (id) => `/tasks/${encodeURIComponent(id)}`,
      transformResponse: (env: Env<ApiTask>) => mapTask(unwrap(env)),
      providesTags: (_r, _e, id) => [{ type: "Task", id }],
    }),
    createTask: build.mutation<Task, NewTaskInput>({
      query: (body) => ({ url: "/tasks", method: "POST", body }),
      transformResponse: (env: Env<ApiTask>) => mapTask(unwrap(env)),
      invalidatesTags: [{ type: "Task", id: "LIST" }, { type: "Case", id: "LIST" }, "Dashboard", "Notification"],
    }),
    updateTask: build.mutation<Task, { id: string } & TaskChanges>({
      query: ({ id, ...body }) => ({ url: `/tasks/${encodeURIComponent(id)}`, method: "PATCH", body }),
      transformResponse: (env: Env<ApiTask>) => mapTask(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Task", id }, { type: "Task", id: "LIST" }, "Dashboard", "Notification"],
    }),
    completeTask: build.mutation<Task, string>({
      query: (id) => ({ url: `/tasks/${encodeURIComponent(id)}/complete`, method: "POST" }),
      transformResponse: (env: Env<ApiTask>) => mapTask(unwrap(env)),
      invalidatesTags: (_r, _e, id) => [{ type: "Task", id }, { type: "Task", id: "LIST" }, "Case", "Dashboard"],
    }),
    reopenTask: build.mutation<Task, string>({
      query: (id) => ({ url: `/tasks/${encodeURIComponent(id)}/reopen`, method: "POST" }),
      transformResponse: (env: Env<ApiTask>) => mapTask(unwrap(env)),
      invalidatesTags: (_r, _e, id) => [{ type: "Task", id }, { type: "Task", id: "LIST" }, "Case", "Dashboard"],
    }),
    deleteTask: build.mutation<Task, string>({
      query: (id) => ({ url: `/tasks/${encodeURIComponent(id)}`, method: "DELETE" }),
      transformResponse: (env: Env<ApiTask>) => mapTask(unwrap(env)),
      invalidatesTags: [{ type: "Task", id: "LIST" }, "Case", "Dashboard"],
    }),

    // ---- follow-ups and interactions --------------------------------------------------------------------------
    followUps: build.query<Paged<FollowUp>, ListFollowUpsParams | void>({
      query: (p) => ({ url: "/followups", params: params({ ...(p ?? {}) }) }),
      transformResponse: (env: Env<ApiFollowUp[], PageMeta>) => toPage(env, mapFollowUp),
      providesTags: (r) => [{ type: "FollowUp", id: "LIST" }, ...(r?.items ?? []).map((f) => ({ type: "FollowUp" as const, id: f.id }))],
    }),
    createFollowUp: build.mutation<FollowUp, { clientId: string; type: string; due: string; note: string }>({
      query: (body) => ({ url: "/followups", method: "POST", body }),
      transformResponse: (env: Env<ApiFollowUp>) => mapFollowUp(unwrap(env)),
      invalidatesTags: [{ type: "FollowUp", id: "LIST" }, { type: "Client", id: "LIST" }, "Dashboard"],
    }),
    updateFollowUp: build.mutation<FollowUp, { id: string; type?: string; due?: string; note?: string }>({
      query: ({ id, ...body }) => ({ url: `/followups/${encodeURIComponent(id)}`, method: "PATCH", body }),
      transformResponse: (env: Env<ApiFollowUp>) => mapFollowUp(unwrap(env)),
      invalidatesTags: [{ type: "FollowUp", id: "LIST" }, { type: "Client", id: "LIST" }, "Dashboard"],
    }),
    completeFollowUp: build.mutation<FollowUp, { id: string; outcome: string }>({
      query: ({ id, ...body }) => ({ url: `/followups/${encodeURIComponent(id)}/done`, method: "POST", body }),
      transformResponse: (env: Env<ApiFollowUp>) => mapFollowUp(unwrap(env)),
      invalidatesTags: [{ type: "FollowUp", id: "LIST" }, { type: "Interaction", id: "LIST" }, { type: "Client", id: "LIST" }, "Dashboard"],
    }),
    deleteFollowUp: build.mutation<FollowUp, string>({
      query: (id) => ({ url: `/followups/${encodeURIComponent(id)}`, method: "DELETE" }),
      transformResponse: (env: Env<ApiFollowUp>) => mapFollowUp(unwrap(env)),
      invalidatesTags: [{ type: "FollowUp", id: "LIST" }, { type: "Client", id: "LIST" }, "Dashboard"],
    }),
    interactions: build.query<Paged<Interaction>, { clientId: string; page?: number; limit?: number }>({
      query: ({ clientId, ...p }) => ({ url: `/clients/${encodeURIComponent(clientId)}/interactions`, params: params({ ...p }) }),
      transformResponse: (env: Env<ApiInteraction[], PageMeta>, _m, arg) => toPage(env, (i) => mapInteraction(i, arg.clientId)),
      providesTags: [{ type: "Interaction", id: "LIST" }],
    }),
    recentInteractions: build.query<Paged<RecentInteraction>, { clientId?: string; page?: number; limit?: number } | void>({
      query: (p) => ({ url: "/followups/interactions", params: params({ ...(p ?? {}) }) }),
      transformResponse: (env: Env<ApiRecentInteraction[], PageMeta>) => toPage(env, mapRecentInteraction),
      providesTags: [{ type: "Interaction", id: "LIST" }],
    }),
    createInteraction: build.mutation<Interaction, { clientId: string; kind: string; text: string }>({
      query: ({ clientId, ...body }) => ({ url: `/clients/${encodeURIComponent(clientId)}/interactions`, method: "POST", body }),
      transformResponse: (env: Env<ApiInteraction>, _m, arg) => mapInteraction(unwrap(env), arg.clientId),
      invalidatesTags: [{ type: "Interaction", id: "LIST" }, { type: "Client", id: "LIST" }],
    }),

    /** The service catalog as a case form needs it: active services (and the one a case already has). */
    caseServices: build.query<Array<{ id: string; name: string; active: boolean }>, void>({
      query: () => "/services",
      transformResponse: (env: Env<Array<{ id: string; name: string; active: boolean }>>) => unwrap(env).map((s) => ({ id: s.id, name: s.name, active: s.active })),
      providesTags: ["Service"],
    }),

    // ---- what a case page shows from neighbouring areas (read-only, scoped by the server) -------------------------
    caseDocuments: build.query<CaseDocument[], string>({
      query: (clientId) => ({ url: "/documents", params: { clientId, limit: "100" } }),
      transformResponse: (env: Env<ApiCaseDocument[]>) => unwrap(env).map(mapCaseSide.document),
      providesTags: ["Document"],
    }),
    /** How many tickets the client has open (any case): the case overview shows it. */
    openTicketCount: build.query<number, string>({
      query: (clientId) => ({ url: "/tickets", params: { clientId, limit: "100" } }),
      transformResponse: (env: Env<Array<{ status: string }>>) => unwrap(env).filter((t) => t.status !== "RESOLVED" && t.status !== "CLOSED").length,
      providesTags: ["Ticket"],
    }),
    caseFilings: build.query<CaseFiling[], string>({
      query: (caseId) => ({ url: `/cases/${encodeURIComponent(caseId)}/filings`, params: { limit: "100" } }),
      transformResponse: (env: Env<ApiCaseFiling[]>) => unwrap(env).map(mapCaseSide.filing),
      providesTags: ["Filing"],
    }),
    saveCaseFiling: build.mutation<CaseFiling, { id?: string } & FilingInput>({
      query: ({ id, ...body }) => (id ? { url: `/filings/${encodeURIComponent(id)}`, method: "PATCH", body } : { url: "/filings", method: "POST", body }),
      transformResponse: (env: Env<ApiCaseFiling>) => mapCaseSide.filing(unwrap(env)),
      invalidatesTags: ["Filing", { type: "Case", id: "LIST" }],
    }),
    caseMessages: build.query<CaseMessage[], { clientId: string; limit?: number }>({
      query: ({ clientId, limit }) => ({ url: `/clients/${encodeURIComponent(clientId)}/messages`, params: { limit: String(limit ?? 5) } }),
      transformResponse: (env: Env<ApiCaseMessage[]>) => unwrap(env).map(mapCaseSide.message).reverse(),
      providesTags: ["Message"],
    }),
  }),
});

export const {
  useCasesQuery,
  useCaseQuery,
  useCreateCaseMutation,
  useUpdateCaseMutation,
  useMoveStageMutation,
  useAddCaseNoteMutation,
  useClientTimelineQuery,
  useTasksQuery,
  useTaskQuery,
  useCreateTaskMutation,
  useUpdateTaskMutation,
  useCompleteTaskMutation,
  useReopenTaskMutation,
  useDeleteTaskMutation,
  useFollowUpsQuery,
  useCreateFollowUpMutation,
  useUpdateFollowUpMutation,
  useCompleteFollowUpMutation,
  useDeleteFollowUpMutation,
  useInteractionsQuery,
  useRecentInteractionsQuery,
  useCreateInteractionMutation,
  useCaseDocumentsQuery,
  useCaseFilingsQuery,
  useOpenTicketCountQuery,
  useSaveCaseFilingMutation,
  useCaseMessagesQuery,
  useCaseServicesQuery,
} = casesApi;
