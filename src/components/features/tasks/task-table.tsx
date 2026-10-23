"use client";

import { taskStatus } from "@/components/features/tasks/task-helpers";
import { Badge } from "@/components/ui/badge";
import { PRIORITY_TONE } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { cn } from "@/lib/cn";
import { ago, fmtDay, relDay } from "@/lib/dates";
import { useCompleteTaskMutation, useReopenTaskMutation } from "@/store/api/cases";
import type { Task } from "@/types/domain";

interface TaskTableProps {
  tasks: Task[];
  activeId: string | null;
  onOpen: (id: string) => void;
}

export function TaskTable({ tasks, activeId, onOpen }: TaskTableProps) {
  const run = useAction();
  const [complete] = useCompleteTaskMutation();
  const [reopen] = useReopenTaskMutation();

  return (
    <div className="tbl-wrap">
      <table className="data stack min-w-[900px]">
        <thead>
          <tr>
            <th scope="col" className="w-9">
              <span className="sr-only">Done</span>
            </th>
            <th scope="col">Task</th>
            <th scope="col">Case</th>
            <th scope="col">Assignee</th>
            <th scope="col">Priority</th>
            <th scope="col">Due</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const status = taskStatus(t);
            return (
              <tr key={t.id} className={cn(activeId === t.id && "is-active")}>
                <td className="tl-left">
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => void run(t.done ? reopen(t.id) : complete(t.id))}
                    aria-label={`Mark ${t.title} ${t.done ? "open again" : "done"}`}
                    className="size-[18px] accent-primary"
                  />
                </td>
                <td className="tl-left">
                  <button type="button" className={cn("linkb font-medium", t.done && "text-muted-foreground line-through")} onClick={() => onOpen(t.id)}>
                    {t.title}
                  </button>
                </td>
                <td data-label="Case">
                  <span className="mono text-xs">{t.project}</span>
                  <div className="help">{t.clientName}</div>
                </td>
                <td data-label="Assignee" className="whitespace-nowrap">
                  {t.assigneeName}
                </td>
                <td data-label="Priority">
                  <Badge tone={PRIORITY_TONE[t.priority] ?? "q"}>{t.priority || "Normal"}</Badge>
                </td>
                <td data-label="Due" className={cn("whitespace-nowrap text-sm", t.overdue && "font-semibold text-danger-hover")}>
                  {t.due ? fmtDay(t.due) : "—"}
                  <div className="help font-normal">{t.done ? `Completed ${t.completedAt ? ago(t.completedAt) : ""}` : t.due ? relDay(t.due) : ""}</div>
                </td>
                <td data-label="Status">
                  <Badge tone={status.tone}>{status.label}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
