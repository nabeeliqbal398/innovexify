"use client";

import { isOverdue, taskStatus } from "@/components/features/tasks/task-helpers";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { PRIORITY_TONE } from "@/constants/vocab";
import { useAppDispatch, useData } from "@/hooks/useStore";
import { ago, fmtDay, relDay } from "@/lib/dates";
import { toggleTask } from "@/store/actions/cases";
import { userName } from "@/store/selectors";
import type { Task } from "@/types/domain";

interface TaskTableProps {
  tasks: Task[];
  activeId: number | null;
  onOpen: (id: number) => void;
}

export function TaskTable({ tasks, activeId, onOpen }: TaskTableProps) {
  const data = useData();
  const dispatch = useAppDispatch();

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
            const project = data.projects.find((p) => p.id === t.project);
            const client = data.users.find((u) => u.id === project?.client);
            const status = taskStatus(t);
            const late = isOverdue(t);
            return (
              <tr key={t.id} className={cn(activeId === t.id && "is-active")}>
                <td className="tl-left">
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => dispatch(toggleTask(t.id))}
                    aria-label={`Mark ${t.title} done`}
                    className="size-[18px] accent-primary"
                  />
                </td>
                <td className="tl-left">
                  <button type="button" className={cn("linkb font-medium", t.done && "text-muted-foreground line-through")} onClick={() => onOpen(t.id)}>
                    {t.title}
                  </button>
                </td>
                <td data-label="Case">
                  <span className="mono text-xs">{client?.caseId}</span>
                  <div className="help">{client?.name}</div>
                </td>
                <td data-label="Assignee" className="whitespace-nowrap">
                  {t.assignee ? userName(data, t.assignee) : "Unassigned"}
                </td>
                <td data-label="Priority">
                  <Badge tone={PRIORITY_TONE[t.priority] ?? "q"}>{t.priority || "Normal"}</Badge>
                </td>
                <td data-label="Due" className={cn("whitespace-nowrap text-sm", late && "font-semibold text-danger-hover")}>
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
