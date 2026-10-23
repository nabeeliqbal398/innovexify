import { mapHomeCase, mapHomeDoc, mapHomeTask, type ApiHomeCase, type ApiHomeDoc, type ApiHomeTask, type HomeCase, type HomeDoc, type HomeTask } from "@/lib/mappers/home";
import type { PageMeta } from "@/types/api";
import { baseApi } from "./base";
import { unwrap, type Env } from "./envelope";

/** The client's Home page: their company name and their own case, documents and shared tasks (all scoped by the server). */
export const homeApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    portalCompany: build.query<{ name: string }, void>({
      query: () => "/company",
      transformResponse: (env: Env<{ name: string }>) => ({ name: unwrap(env).name }),
      providesTags: ["Company"],
    }),
    /** The client's current case, with its stage history. */
    homeCase: build.query<HomeCase | null, void>({
      queryFn: async (_arg, _api, _extra, baseQuery) => {
        const list = await baseQuery({ url: "/cases", params: { limit: "1" } });
        if (list.error) return { error: list.error };
        const first = (list.data as Env<ApiHomeCase[], PageMeta>).data[0];
        if (!first) return { data: null };
        const detail = await baseQuery(`/cases/${encodeURIComponent(first.id)}`);
        if (detail.error) return { error: detail.error };
        return { data: mapHomeCase(unwrap(detail.data as Env<ApiHomeCase>)) };
      },
      providesTags: ["Case"],
    }),
    homeDocuments: build.query<HomeDoc[], void>({
      query: () => ({ url: "/documents", params: { limit: "100" } }),
      transformResponse: (env: Env<ApiHomeDoc[], PageMeta>) => env.data.map(mapHomeDoc),
      providesTags: ["Document"],
    }),
    /** Tasks the team shared with the client, still open. */
    homeTasks: build.query<HomeTask[], void>({
      query: () => ({ url: "/tasks", params: { limit: "50", done: "false" } }),
      transformResponse: (env: Env<ApiHomeTask[], PageMeta>) => env.data.map(mapHomeTask),
      providesTags: ["Task"],
    }),
  }),
});

export const { usePortalCompanyQuery, useHomeCaseQuery, useHomeDocumentsQuery, useHomeTasksQuery } = homeApi;
