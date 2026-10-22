import type { Prisma } from "@prisma/client";

export const taskSelect = {
  id: true,
  caseId: true,
  title: true,
  type: true,
  visibility: true,
  done: true,
  priority: true,
  due: true,
  createdById: true,
  assigneeId: true,
  completedById: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  case: {
    select: {
      id: true,
      number: true,
      stage: true,
      deletedAt: true,
      clientId: true,
      client: { select: { id: true, name: true, clientProfile: { select: { caseNumber: true, csrId: true } } } },
    },
  },
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
} satisfies Prisma.TaskSelect;

export type TaskRecord = Prisma.TaskGetPayload<{ select: typeof taskSelect }>;

export type TaskSortField = "due" | "priority" | "title" | "createdAt" | "done";
export const TASK_SORT_FIELDS: readonly TaskSortField[] = ["due", "priority", "title", "createdAt", "done"];

/** Tasks can't be due before this date (guards against typos such as 0202-01-01 and 1999). */
export const EARLIEST_DUE_DATE = "2020-01-01";
