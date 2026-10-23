import { normalizeApiError } from "@/lib/api-error";
import { baseApi } from "./base";

export type ProbeKind = "remove" | "doc" | "reassign" | "brand" | "other" | "caseEdit" | "audit" | "fee" | "filing";

/**
 * Direct requests for the "Access & scenarios" panel. Each one calls a real endpoint, so a refusal is decided by the server and
 * written to the audit log like any crafted request. They are chosen so that a request that IS allowed changes nothing: a read,
 * a write that sends the value already stored, or a delete of an id that does not exist (the permission check comes first, so a
 * person without the right is refused with 403, and everyone else gets "not found").
 */
export const PROBES: ReadonlyArray<{ kind: ProbeKind; label: string }> = [
  { kind: "remove", label: "Remove a user from the portal" },
  { kind: "doc", label: "Download a client document" },
  { kind: "reassign", label: "Reassign a client to their current CSR" },
  { kind: "brand", label: "Change the company name" },
  { kind: "other", label: "Read another CSR's client record" },
  { kind: "caseEdit", label: "Edit a case's details" },
  { kind: "audit", label: "Open the Audit & Security log" },
  { kind: "fee", label: "Change a service fee" },
  { kind: "filing", label: "Edit the state filing tracker" },
];

interface Found {
  data?: { data?: unknown };
}
const first = (r: unknown): Record<string, unknown> | undefined => {
  const list = (r as Found | undefined)?.data?.data;
  return Array.isArray(list) ? (list[0] as Record<string, unknown> | undefined) : undefined;
};

export const probesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Resolves to the HTTP status of the probe request (0 when it could not be sent). Never rejects. */
    probe: build.mutation<{ status: number }, ProbeKind>({
      queryFn: async (kind, _api, _extra, baseQuery) => {
        const send = async (url: string, method: "GET" | "PATCH" | "DELETE" = "GET", body?: unknown): Promise<number> => {
          const res = await baseQuery({ url, method, ...(body === undefined ? {} : { body }) });
          return res.error ? normalizeApiError(res.error).status : 200;
        };
        const lookup = (url: string) => baseQuery({ url });
        switch (kind) {
          case "remove":
            return { data: { status: await send("/users/probe-no-such-user", "DELETE") } };
          case "audit":
            return { data: { status: await send("/audit?limit=1") } };
          case "other":
            // A seeded client of the second CSR (Sarah Johnson): outside John Smith's scope, so he is told "not found".
            return { data: { status: await send("/clients/c43") } };
          case "doc": {
            const doc = first(await lookup("/documents?status=SUBMITTED&limit=1"));
            return { data: { status: await send(`/documents/${String(doc?.id ?? "probe-no-such-document")}/download`) } };
          }
          case "reassign": {
            const client = first(await lookup("/clients?limit=1"));
            const csr = (client?.csr as { id?: string } | null | undefined)?.id;
            return { data: { status: await send(`/clients/${String(client?.id ?? "probe-no-such-client")}/csr`, "PATCH", { csrId: csr ?? "me" }) } };
          }
          case "brand": {
            const company = await lookup("/company");
            const name = (company.data as { data?: { name?: string } } | undefined)?.data?.name ?? "Innovexify";
            return { data: { status: await send("/company", "PATCH", { name }) } };
          }
          case "caseEdit": {
            const found = first(await lookup("/cases?limit=1"));
            const priority = String(found?.priority ?? "NORMAL");
            return { data: { status: await send(`/cases/${String(found?.id ?? "probe-no-such-case")}`, "PATCH", { version: Number(found?.version ?? 1), priority }) } };
          }
          case "fee": {
            const services = await lookup("/services");
            const list = (services.data as { data?: Array<{ id: string; fee: string }> } | undefined)?.data ?? [];
            const service = list[0];
            return { data: { status: await send(`/services/${service?.id ?? "probe-no-such-service"}`, "PATCH", { fee: service?.fee ?? "" }) } };
          }
          case "filing": {
            const filing = first(await lookup("/filings?limit=1"));
            return { data: { status: await send(`/filings/${String(filing?.id ?? "probe-no-such-filing")}`, "PATCH", { type: String(filing?.type ?? "Probe") }) } };
          }
        }
      },
    }),
  }),
});

export const { useProbeMutation } = probesApi;
