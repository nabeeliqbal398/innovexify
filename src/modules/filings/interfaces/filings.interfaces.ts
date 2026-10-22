import type { Prisma } from "@prisma/client";

export const filingSelect = {
  id: true,
  number: true,
  caseId: true,
  type: true,
  status: true,
  submittedOn: true,
  reference: true,
  nextAction: true,
  nextActionDate: true,
  outcome: true,
  updatedAt: true,
  case: {
    select: {
      id: true,
      number: true,
      stage: true,
      deletedAt: true,
      client: { select: { id: true, name: true, clientProfile: { select: { caseNumber: true } } } },
    },
  },
} satisfies Prisma.FilingSelect;
export type FilingRecord = Prisma.FilingGetPayload<{ select: typeof filingSelect }>;

export const reminderSelect = { id: true, title: true, date: true, kind: true, illustrative: true } satisfies Prisma.ReminderSelect;
export type ReminderRecord = Prisma.ReminderGetPayload<{ select: typeof reminderSelect }>;

export type FilingSortField = "number" | "status" | "submittedOn" | "nextActionDate" | "type";
export const FILING_SORT_FIELDS: readonly FilingSortField[] = ["number", "status", "submittedOn", "nextActionDate", "type"];
