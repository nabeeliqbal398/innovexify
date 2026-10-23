import type { Analytics } from "@/components/features/analytics/analytics-model";
import type { Overview } from "@/components/features/overview/overview-model";
import { mapAnalytics, mapOverview, type ApiAnalytics, type ApiOverview, type NavCounts } from "@/lib/api-mappers";
import type { User } from "@/types/domain";
import { baseApi } from "./base";
import { params, unwrap, type Env } from "./envelope";

export interface SearchTarget {
  view: string;
  id?: string;
  query?: Record<string, string>;
}
export interface SearchItem {
  title: string;
  meta: string;
  target: SearchTarget;
}
export interface SearchGroup {
  key: string;
  label: string;
  items: SearchItem[];
}
export interface SearchResult {
  query: string;
  groups: SearchGroup[];
}

export const dashboardApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    overview: build.query<Overview, User>({
      // The role decides the wording; the cache key is the person, so a role change can't show another role's numbers.
      query: () => "/dashboard/overview",
      transformResponse: (env: Env<ApiOverview>, _meta, me) => mapOverview(unwrap(env), me),
      providesTags: ["Dashboard"],
      serializeQueryArgs: ({ queryArgs }) => queryArgs.id,
    }),
    navCounts: build.query<NavCounts, void>({
      query: () => "/dashboard/nav-counts",
      transformResponse: (env: Env<NavCounts>) => unwrap(env),
      providesTags: ["Dashboard", "Message", "Document", "Ticket", "FollowUp", "Task", "Report"],
    }),
    analytics: build.query<Analytics, { from: string; to: string }>({
      query: (p) => ({ url: "/analytics", params: params({ ...p }) }),
      transformResponse: (env: Env<ApiAnalytics>) => mapAnalytics(unwrap(env)),
      providesTags: ["Analytics"],
    }),
    search: build.query<SearchResult, string>({
      query: (q) => ({ url: "/search", params: params({ q }) }),
      transformResponse: (env: Env<SearchResult>) => unwrap(env),
    }),
  }),
});

export const { useOverviewQuery, useNavCountsQuery, useAnalyticsQuery, useLazySearchQuery } = dashboardApi;
