import { z } from "zod";

import type { BadgeTone } from "@/constants/vocab";
import type { Task } from "@/types/domain";

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Enter a task title.").max(200, "Keep the title under 200 characters."),
  assigneeId: z.string().min(1, "Choose who does the work."),
  priority: z.enum(["Low", "Normal", "High", "Urgent"]),
  due: z.string().min(1, "Choose a due date."),
  vis: z.enum(["internal", "client"]),
});
export type TaskValues = z.infer<typeof taskSchema>;

/** Overdue is the server's call (its date, UTC), carried on each task. */
export function isOverdue(task: Task): boolean {
  return task.overdue;
}

export function taskStatus(task: Task): { label: "Done" | "Overdue" | "Open"; tone: BadgeTone } {
  if (task.done) return { label: "Done", tone: "ok" };
  return task.overdue ? { label: "Overdue", tone: "err" } : { label: "Open", tone: "info" };
}
