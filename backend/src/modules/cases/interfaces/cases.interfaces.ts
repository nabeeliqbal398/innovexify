import type { Prisma } from "@prisma/client";

export const caseSelect = {
  id: true,
  number: true,
  clientId: true,
  serviceId: true,
  stage: true,
  status: true,
  priority: true,
  deadline: true,
  filingConfirmation: true,
  ownerId: true,
  completedAt: true,
  lastActivityAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  client: {
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      clientProfile: { select: { caseNumber: true, businessName: true, formationState: true, csrId: true, csr: { select: { id: true, name: true } } } },
    },
  },
  service: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
} satisfies Prisma.CaseSelect;

export type CaseRecord = Prisma.CaseGetPayload<{ select: typeof caseSelect }>;

export const eventSelect = {
  id: true,
  toStage: true,
  note: true,
  at: true,
  by: { select: { id: true, name: true } },
} satisfies Prisma.CaseEventSelect;
export type EventRecord = Prisma.CaseEventGetPayload<{ select: typeof eventSelect }>;

export const noteSelect = {
  id: true,
  caseId: true,
  visibility: true,
  text: true,
  createdAt: true,
  author: { select: { id: true, name: true } },
} satisfies Prisma.CaseNoteSelect;
export type NoteRecord = Prisma.CaseNoteGetPayload<{ select: typeof noteSelect }>;

export const filingSelect = {
  id: true,
  number: true,
  type: true,
  status: true,
  submittedOn: true,
  reference: true,
  nextAction: true,
  nextActionDate: true,
} satisfies Prisma.FilingSelect;
export type FilingRecord = Prisma.FilingGetPayload<{ select: typeof filingSelect }>;

export type CaseSortField = "number" | "stage" | "status" | "priority" | "deadline" | "lastActivityAt" | "createdAt" | "clientName" | "formationState";
export const CASE_SORT_FIELDS: readonly CaseSortField[] = ["number", "stage", "status", "priority", "deadline", "lastActivityAt", "createdAt", "clientName", "formationState"];
