import { filenameFromDisposition, holdBlob, type DownloadSummary } from "@/lib/download";
import { mapDocument, type ApiDocument } from "@/lib/api-mappers";
import type { PageMeta, Paged } from "@/types/api";
import type { ClientDoc } from "@/types/domain";
import { baseApi } from "./base";
import { params, toPage, unwrap, type Env } from "./envelope";

export interface ListDocumentsParams {
  clientId?: string;
  /** An API status key: REQUESTED, SUBMITTED, APPROVED, REJECTED, SHARED, INFO. */
  status?: string;
  /** An API type key: IDENTITY, ADDRESS, ... */
  type?: string;
  /** submissions: everything except still-requested and shared; outstanding: requested or sent back. */
  group?: "submissions" | "outstanding";
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

const touched = (id: string) => [{ type: "Document" as const, id }, { type: "Document" as const, id: "LIST" }, "Dashboard" as const, "Client" as const];

export const documentsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    documents: build.query<Paged<ClientDoc>, ListDocumentsParams | void>({
      query: (p) => ({ url: "/documents", params: params({ ...(p ?? {}) }) }),
      transformResponse: (env: Env<ApiDocument[], PageMeta>) => toPage(env, mapDocument),
      providesTags: (r) => [{ type: "Document", id: "LIST" }, ...(r?.items ?? []).map((d) => ({ type: "Document" as const, id: d.id }))],
    }),
    document: build.query<ClientDoc, string>({
      query: (id) => `/documents/${encodeURIComponent(id)}`,
      transformResponse: (env: Env<ApiDocument>) => mapDocument(unwrap(env)),
      providesTags: (_r, _e, id) => [{ type: "Document", id }],
    }),
    requestDocument: build.mutation<ClientDoc, { clientId: string; name: string; type?: string; note?: string }>({
      query: (body) => ({ url: "/documents/request", method: "POST", body }),
      transformResponse: (env: Env<ApiDocument>) => mapDocument(unwrap(env)),
      invalidatesTags: [{ type: "Document", id: "LIST" }, "Dashboard", "Notification"],
    }),
    /** Staff upload a finished document for a client (multipart: clientId, optional name, the file). */
    shareDocument: build.mutation<ClientDoc, { clientId: string; name?: string; file: File }>({
      query: ({ clientId, name, file }) => {
        const body = new FormData();
        body.append("clientId", clientId);
        if (name) body.append("name", name);
        body.append("file", file);
        return { url: "/documents/share", method: "POST", body };
      },
      transformResponse: (env: Env<ApiDocument>) => mapDocument(unwrap(env)),
      invalidatesTags: [{ type: "Document", id: "LIST" }, "Notification"],
    }),
    /** A client answers a request with a file. */
    uploadDocument: build.mutation<ClientDoc, { id: string; file: File }>({
      query: ({ id, file }) => {
        const body = new FormData();
        body.append("file", file);
        return { url: `/documents/${encodeURIComponent(id)}/upload`, method: "POST", body };
      },
      transformResponse: (env: Env<ApiDocument>) => mapDocument(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => touched(id),
    }),
    reviewDocument: build.mutation<ClientDoc, { id: string; decision: "APPROVED" | "REJECTED" | "INFO"; reason?: string }>({
      query: ({ id, ...body }) => ({ url: `/documents/${encodeURIComponent(id)}/review`, method: "POST", body }),
      transformResponse: (env: Env<ApiDocument>) => mapDocument(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => [...touched(id), "Notification"],
    }),
    deleteDocument: build.mutation<ClientDoc, string>({
      query: (id) => ({ url: `/documents/${encodeURIComponent(id)}`, method: "DELETE" }),
      transformResponse: (env: Env<ApiDocument>) => mapDocument(unwrap(env)),
      invalidatesTags: (_r, _e, id) => touched(id),
    }),
    /**
     * Fetch the file through the authenticated route. The bytes are held outside Redux (see `takeBlob`); the result is a small
     * summary. A refusal (403 for a CSR) is the normal error with the server's reason.
     */
    downloadDocument: build.mutation<DownloadSummary, string>({
      query: (id) => `/documents/${encodeURIComponent(id)}/download`,
      transformResponse: (blob: Blob, meta) => ({
        key: holdBlob(blob),
        filename: filenameFromDisposition((meta as { response?: Response } | undefined)?.response?.headers.get("content-disposition")),
        mimeType: blob.type || "application/octet-stream",
      }),
      // A download is audited on the server; the audit log screen refetches.
      invalidatesTags: ["Audit"],
    }),
  }),
});

export const {
  useDocumentsQuery,
  useDocumentQuery,
  useRequestDocumentMutation,
  useShareDocumentMutation,
  useUploadDocumentMutation,
  useReviewDocumentMutation,
  useDeleteDocumentMutation,
  useDownloadDocumentMutation,
} = documentsApi;
