import type { Prisma } from "@prisma/client";

/** Never includes passwordHash, failed-login counters or token data. */
export const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  invitedById: true,
  invitedBy: { select: { name: true } },
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  clientProfile: { select: { caseNumber: true, csrId: true } },
} satisfies Prisma.UserSelect;

export type UserRecord = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export type UserSortField = "name" | "email" | "role" | "status" | "createdAt" | "lastLoginAt";
export const USER_SORT_FIELDS: readonly UserSortField[] = ["name", "email", "role", "status", "createdAt", "lastLoginAt"];

export interface ReassignmentLoad {
  clients: number;
  openTasks: number;
}
