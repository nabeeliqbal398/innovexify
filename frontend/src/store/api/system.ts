import {
  mapAuditEntry,
  mapCompany,
  mapService,
  mapTrigger,
  type ApiAccessMatrix,
  type ApiAuditEntry,
  type ApiCompany,
  type ApiService,
  type ApiTrigger,
} from "@/lib/api-mappers";
import type { PageMeta, Paged } from "@/types/api";
import type { AuditEntry, Company, Service, Trigger } from "@/types/domain";
import { baseApi } from "./base";
import { params, toPage, unwrap, type Env } from "./envelope";

export interface AuditParams {
  actorId?: string;
  /** A category name, or "refused" for refused attempts. */
  category?: string;
  ok?: boolean;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ServiceInput {
  name: string;
  category: string;
  description: string;
  requirements?: string[];
  stages: string[];
  turnaround?: string;
  fee?: string;
}

export interface DownloadedFile {
  blob: Blob;
  filename: string;
  truncated: boolean;
}

const filenameOf = (response: Response | undefined, fallback: string): string => {
  const header = response?.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/.exec(header);
  return match?.[1] ?? fallback;
};

export const systemApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    audit: build.query<Paged<AuditEntry>, AuditParams | void>({
      query: (p) => ({ url: "/audit", params: params({ ...(p ?? {}) }) }),
      transformResponse: (env: Env<ApiAuditEntry[], PageMeta>) => toPage(env, mapAuditEntry),
      providesTags: [{ type: "Audit", id: "LIST" }],
    }),
    /** The CSV, streamed by the server through the authenticated route. */
    auditExport: build.mutation<DownloadedFile, Omit<AuditParams, "page" | "limit"> | void>({
      query: (p) => ({ url: "/audit/export", params: params({ ...(p ?? {}) }) }),
      transformResponse: (blob: Blob, meta) => {
        const response = (meta as { response?: Response } | undefined)?.response;
        return { blob, filename: filenameOf(response, "audit-log.csv"), truncated: response?.headers.get("x-export-truncated") === "true" };
      },
    }),

    company: build.query<Company, void>({
      query: () => "/company",
      transformResponse: (env: Env<ApiCompany>) => mapCompany(unwrap(env)),
      providesTags: ["Company"],
    }),
    updateCompany: build.mutation<{ company: Company; message: string }, { name?: string; casePrefix?: string; logo?: string }>({
      query: (body) => ({ url: "/company", method: "PATCH", body }),
      transformResponse: (env: Env<ApiCompany>) => ({ company: mapCompany(unwrap(env)), message: env.message ?? "Saved." }),
      invalidatesTags: ["Company"],
    }),

    services: build.query<Service[], void>({
      query: () => "/services",
      transformResponse: (env: Env<ApiService[]>) => unwrap(env).map(mapService),
      providesTags: ["Service"],
    }),
    createService: build.mutation<Service, ServiceInput>({
      query: (body) => ({ url: "/services", method: "POST", body }),
      transformResponse: (env: Env<ApiService>) => mapService(unwrap(env)),
      invalidatesTags: ["Service"],
    }),
    updateService: build.mutation<Service, { id: string } & Partial<ServiceInput>>({
      query: ({ id, ...body }) => ({ url: `/services/${encodeURIComponent(id)}`, method: "PATCH", body }),
      transformResponse: (env: Env<ApiService>) => mapService(unwrap(env)),
      invalidatesTags: ["Service"],
    }),
    setServiceActive: build.mutation<Service, { id: string; active: boolean }>({
      query: ({ id, active }) => ({ url: `/services/${encodeURIComponent(id)}/${active ? "reactivate" : "deactivate"}`, method: "POST" }),
      transformResponse: (env: Env<ApiService>) => mapService(unwrap(env)),
      invalidatesTags: ["Service"],
    }),

    triggers: build.query<Trigger[], void>({
      query: () => "/automation/triggers",
      transformResponse: (env: Env<ApiTrigger[]>) => unwrap(env).map(mapTrigger),
      providesTags: ["Trigger"],
    }),
    updateTrigger: build.mutation<Trigger, { key: string; enabled?: boolean; template?: string }>({
      query: ({ key, ...body }) => ({ url: `/automation/triggers/${encodeURIComponent(key)}`, method: "PATCH", body }),
      transformResponse: (env: Env<ApiTrigger>) => mapTrigger(unwrap(env)),
      invalidatesTags: ["Trigger"],
    }),

    accessMatrix: build.query<ApiAccessMatrix, void>({
      query: () => "/access/matrix",
      transformResponse: (env: Env<ApiAccessMatrix>) => unwrap(env),
    }),
  }),
});

export const {
  useAuditQuery,
  useAuditExportMutation,
  useCompanyQuery,
  useUpdateCompanyMutation,
  useServicesQuery,
  useCreateServiceMutation,
  useUpdateServiceMutation,
  useSetServiceActiveMutation,
  useTriggersQuery,
  useUpdateTriggerMutation,
  useAccessMatrixQuery,
} = systemApi;
