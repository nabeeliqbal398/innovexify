import type { Prisma } from "@prisma/client";

export const caseBriefSelect = {
  id: true,
  number: true,
  serviceId: true,
  stage: true,
  status: true,
  priority: true,
  deadline: true,
  lastActivityAt: true,
} satisfies Prisma.CaseSelect;

export const clientSelect = {
  id: true,
  email: true,
  name: true,
  status: true,
  deletedAt: true,
  createdAt: true,
  clientProfile: {
    select: {
      caseNumber: true,
      csrId: true,
      businessName: true,
      formationState: true,
      phone: true,
      address: true,
      contactPreference: true,
      preferredName: true,
      joinedAt: true,
      csr: { select: { id: true, name: true } },
    },
  },
  clientCases: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, select: caseBriefSelect },
} satisfies Prisma.UserSelect;

export type ClientRecord = Prisma.UserGetPayload<{ select: typeof clientSelect }>;

export type ClientSortField = "name" | "email" | "status" | "caseNumber" | "businessName" | "formationState" | "joinedAt" | "createdAt";
export const CLIENT_SORT_FIELDS: readonly ClientSortField[] = ["name", "email", "status", "caseNumber", "businessName", "formationState", "joinedAt", "createdAt"];
