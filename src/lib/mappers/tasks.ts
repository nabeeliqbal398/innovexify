import type { Task } from "@/types/domain";
import { toDay, toMs, type Ref } from "./common";
import { PRIORITY, TASK_TYPE, TASK_VISIBILITY } from "./enums";

/** `GET /tasks` and `GET /tasks/:id`. */
export interface ApiTask {
  id: string;
  title: string;
  type: string;
  visibility: string;
  priority: string;
  due: string;
  done: boolean;
  overdue: boolean;
  case: { id: string; number: number; displayNumber: string; client: Ref };
  assignee: Ref | null;
  createdBy: Ref | null;
  completedBy: Ref | null;
  completedAt: string | null;
  createdAt: string;
}

export function mapTask(t: ApiTask): Task {
  return {
    id: t.id,
    project: t.case.displayNumber,
    projectApiId: t.case.id,
    client: t.case.client.id,
    clientName: t.case.client.name,
    title: t.title,
    type: TASK_TYPE.toLabel(t.type),
    vis: TASK_VISIBILITY.toLabel(t.visibility),
    done: t.done,
    overdue: t.overdue,
    by: t.createdBy?.id ?? "",
    byName: t.createdBy?.name ?? "—",
    assignee: t.assignee?.id ?? "",
    assigneeName: t.assignee?.name ?? "—",
    completedByName: t.completedBy?.name,
    due: toDay(t.due),
    priority: PRIORITY.toLabel(t.priority),
    createdAt: toMs(t.createdAt) ?? 0,
    completedAt: toMs(t.completedAt),
  };
}
