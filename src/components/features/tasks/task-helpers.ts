import { z } from "zod";

import type { BadgeTone } from "@/constants/vocab";
import { dISO } from "@/lib/dates";
import { can } from "@/lib/permissions";
import type { AppThunk } from "@/store";
import { check } from "@/store/actions/core";
import type { DemoData, Project, Task, User } from "@/types/domain";

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Enter a task title."),
  assignee: z.string().min(1, "Choose who does the work."),
  priority: z.enum(["Low", "Normal", "High", "Urgent"]),
  due: z.string().min(1, "Choose a due date."),
  vis: z.enum(["internal", "client"]),
});
export type TaskValues = z.infer<typeof taskSchema>;

export function isOverdue(task: Task): boolean {
  return !task.done && Boolean(task.due) && task.due < dISO(0);
}

export function taskStatus(task: Task): { label: "Done" | "Overdue" | "Open"; tone: BadgeTone } {
  if (task.done) return { label: "Done", tone: "ok" };
  return isOverdue(task) ? { label: "Overdue", tone: "err" } : { label: "Open", tone: "info" };
}

/** Projects the signed-in user may see, and the tasks that belong to them. */
export function visibleWork(data: DemoData, me: User): { projects: Project[]; tasks: Task[] } {
  const projects = data.projects.filter((p) => {
    const client = data.users.find((u) => u.id === p.client);
    return client !== undefined && client.status !== "Removed" && can(me, "viewClient", client);
  });
  const ids = new Set(projects.map((p) => p.id));
  return { projects, tasks: data.tasks.filter((t) => ids.has(t.project)) };
}

export function activeStaff(data: DemoData): User[] {
  return data.users.filter((u) => u.role !== "CLIENT" && u.status === "Active");
}

/** Opening the create dialog still has to pass the permission check, so the refusal is explained. */
export function requestNewTask(): AppThunk<boolean> {
  return (dispatch) => dispatch(check("manageTasks", undefined, "Open create task", ""));
}
