import type { DocStatus, Prisma } from "@prisma/client";

const base = {
  id: true,
  clientId: true,
  name: true,
  type: true,
  status: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  reason: true,
  note: true,
  requestedAt: true,
  submittedAt: true,
  reviewedAt: true,
  deletedAt: true,
  client: { select: { id: true, name: true, status: true, clientProfile: { select: { caseNumber: true, csrId: true } } } },
  requestedBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
} satisfies Prisma.DocumentSelect;

/** What a list returns. `storageKey` is deliberately not here: it never leaves the server. */
export const documentListSelect = base;
export type DocumentListRecord = Prisma.DocumentGetPayload<{ select: typeof documentListSelect }>;

/** One document with its history, and the storage key for the code that reads or replaces the file. */
export const documentDetailSelect = {
  ...base,
  storageKey: true,
  history: { orderBy: [{ at: "asc" }, { id: "asc" }], select: { id: true, status: true, note: true, at: true, by: { select: { id: true, name: true } } } },
} satisfies Prisma.DocumentSelect;
export type DocumentDetailRecord = Prisma.DocumentGetPayload<{ select: typeof documentDetailSelect }>;

export type DocumentSortField = "requestedAt" | "name" | "status" | "type" | "submittedAt";
export const DOCUMENT_SORT_FIELDS: readonly DocumentSortField[] = ["requestedAt", "name", "status", "type", "submittedAt"];

/** Display words for the status machine's messages. */
export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  REQUESTED: "Requested",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SHARED: "Shared",
  INFO: "More information needed",
};

/** A client may (re)upload against a request that is open, or that was sent back. */
export const UPLOADABLE: readonly DocStatus[] = ["REQUESTED", "REJECTED", "INFO"];
/** Statuses that count as an open request when looking for duplicates. */
export const OPEN_REQUEST: readonly DocStatus[] = ["REQUESTED", "REJECTED", "INFO"];
