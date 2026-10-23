import type { ClientDoc, DocHistory } from "@/types/domain";
import { toMs, type Ref } from "./common";
import { DOC_STATUS_MAP, DOC_TYPE } from "./enums";

export interface ApiDocEvent {
  id: string;
  status: string;
  note: string;
  at: string;
  by?: Ref;
}

/** `GET /documents` and `GET /documents/:id`. Fields a role may not see are simply absent. */
export interface ApiDocument {
  id: string;
  name: string;
  type: string;
  status: string;
  clientId: string;
  client?: { id: string; name: string; caseNumber: string };
  fileName?: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  reason?: string;
  note?: string;
  requestedBy?: Ref | null;
  reviewedBy?: Ref | null;
  requestedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  history?: ApiDocEvent[];
}

export function mapDocHistory(e: ApiDocEvent): DocHistory {
  return { status: DOC_STATUS_MAP.toLabel(e.status), by: e.by?.id ?? "", byName: e.by?.name, at: toMs(e.at) ?? 0, note: e.note };
}

export function mapDocument(d: ApiDocument): ClientDoc {
  return {
    id: d.id,
    client: d.clientId,
    clientName: d.client?.name,
    clientCaseId: d.client?.caseNumber,
    name: d.name,
    file: d.fileName ?? "",
    status: DOC_STATUS_MAP.toLabel(d.status),
    reason: d.reason ?? "",
    type: DOC_TYPE.toLabel(d.type),
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    requestedAt: toMs(d.requestedAt) ?? 0,
    requestedBy: d.requestedBy?.id,
    requestedByName: d.requestedBy?.name,
    submittedAt: toMs(d.submittedAt),
    reviewedAt: toMs(d.reviewedAt),
    reviewedBy: d.reviewedBy?.id,
    reviewedByName: d.reviewedBy?.name,
    note: d.note ?? "",
    history: (d.history ?? []).map(mapDocHistory),
  };
}
