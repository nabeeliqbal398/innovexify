import type { Prisma, ReportStatus, Role } from "@prisma/client";

export const reportSelect = {
  id: true,
  number: true,
  clientId: true,
  csrId: true,
  caseId: true,
  title: true,
  body: true,
  category: true,
  priority: true,
  action: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true, name: true, clientProfile: { select: { caseNumber: true, csrId: true } } } },
  csr: { select: { id: true, name: true } },
  case: { select: { id: true, number: true } },
} satisfies Prisma.ReportSelect;
export type ReportRecord = Prisma.ReportGetPayload<{ select: typeof reportSelect }>;

export const messageSelect = {
  id: true,
  text: true,
  isNote: true,
  createdAt: true,
  author: { select: { id: true, name: true, role: true } },
} satisfies Prisma.ReportMessageSelect;
export type MessageRecord = Prisma.ReportMessageGetPayload<{ select: typeof messageSelect }>;

export const eventSelect = { id: true, status: true, at: true, by: { select: { id: true, name: true } } } satisfies Prisma.ReportEventSelect;
export type EventRecord = Prisma.ReportEventGetPayload<{ select: typeof eventSelect }>;

export type ReportSortField = "createdAt" | "number" | "priority" | "status" | "updatedAt";
export const REPORT_SORT_FIELDS: readonly ReportSortField[] = ["createdAt", "number", "priority", "status", "updatedAt"];

/** The stored status "Reviewed" reads as "Resolved" everywhere a person sees it (the prototype's reportLabel). */
export const REPORT_LABEL: Record<ReportStatus, string> = {
  SUBMITTED: "Submitted",
  ACKNOWLEDGED: "Acknowledged",
  CLARIFICATION_REQUESTED: "Clarification requested",
  REVIEWED: "Resolved",
};

/**
 * Where Compliance may take a report from each status. Resolved is final. A CSR's reply to a clarification request puts
 * the report back to Submitted (that is the CSR's move, not Compliance's, so it isn't listed here).
 */
export const NEXT_REPORT_STATUS: Record<ReportStatus, readonly ReportStatus[]> = {
  SUBMITTED: ["ACKNOWLEDGED", "CLARIFICATION_REQUESTED", "REVIEWED"],
  ACKNOWLEDGED: ["CLARIFICATION_REQUESTED", "REVIEWED"],
  CLARIFICATION_REQUESTED: ["REVIEWED"],
  REVIEWED: [],
};

/** Compliance-only notes are for Compliance, Manager and Admin: never for the CSR who filed the report. */
export const NOTE_READERS: readonly Role[] = ["ADMIN", "MANAGER", "COMPLIANCE"];
