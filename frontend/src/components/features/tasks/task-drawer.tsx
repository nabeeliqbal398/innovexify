"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { ErrorState, Skeleton } from "@/components/common/query-state";
import { taskSchema, taskStatus, type TaskValues } from "@/components/features/tasks/task-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { Field, FieldRow, Input, Select } from "@/components/ui/form";
import { Facts } from "@/components/ui/primitives";
import { PRIORITIES, ROLE_LABEL } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import { fmtAt } from "@/lib/dates";
import { PRIORITY } from "@/lib/api-mappers";
import { can } from "@/lib/permissions";
import { useCompleteTaskMutation, useDeleteTaskMutation, useReopenTaskMutation, useTaskQuery, useUpdateTaskMutation, type TaskChanges } from "@/store/api/cases";
import { useDirectoryQuery } from "@/store/api/people";
import type { Task } from "@/types/domain";

interface TaskDrawerProps {
  taskId: string;
  onClose: () => void;
  /** Receives the case's API id. */
  onOpenCase: (caseApiId: string) => void;
}

function EditForm({ task, onOpenCase, onDeleted }: { task: Task; onOpenCase: () => void; onDeleted: () => void }) {
  const run = useAction();
  const staff = useDirectoryQuery().data ?? [];
  const [update, { isLoading }] = useUpdateTaskMutation();
  const [complete, completing] = useCompleteTaskMutation();
  const [reopen, reopening] = useReopenTaskMutation();
  const [remove, removing] = useDeleteTaskMutation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isValid },
  } = useForm<TaskValues>({
    resolver: zodResolver(taskSchema),
    mode: "onChange",
    defaultValues: { title: task.title, assigneeId: task.assignee, priority: task.priority, due: task.due, vis: task.vis },
  });

  const submit = handleSubmit(async (values) => {
    const changes: TaskChanges = {};
    if (values.title !== task.title) changes.title = values.title;
    if (values.assigneeId !== task.assignee) changes.assigneeId = values.assigneeId;
    if (values.priority !== task.priority) changes.priority = PRIORITY.toKey(values.priority);
    if (values.due !== task.due) changes.due = values.due;
    if (values.vis !== task.vis) changes.visibility = values.vis === "client" ? "CLIENT" : "INTERNAL";
    if (Object.keys(changes).length === 0) return;
    await run(update({ id: task.id, ...changes }), { success: "Task saved", setError, fields: ["title", "assigneeId", "priority", "due", "visibility"] });
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
      <Field label="Title" error={errors.title?.message}>
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} invalid={Boolean(errors.title)} {...register("title")} />}
      </Field>
      <FieldRow>
        <Field label="Assignee" error={errors.assigneeId?.message}>
          {(id, describedBy) => (
            <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.assigneeId)} {...register("assigneeId")}>
              {!staff.some((u) => u.id === task.assignee) ? <option value={task.assignee}>{task.assigneeName}</option> : null}
              {staff.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {ROLE_LABEL[u.role]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Priority">
          {(id) => (
            <Select id={id} {...register("priority")}>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          )}
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Due date" error={errors.due?.message}>
          {(id, describedBy) => <Input id={id} type="date" aria-describedby={describedBy} invalid={Boolean(errors.due)} {...register("due")} />}
        </Field>
        <Field label="Visibility">
          {(id) => (
            <Select id={id} {...register("vis")}>
              <option value="internal">Internal only</option>
              <option value="client">Visible to client</option>
            </Select>
          )}
        </Field>
      </FieldRow>
      {errors.root?.message ? (
        <span role="alert" className="errtxt">
          {errors.root.message}
        </span>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={!isValid || isLoading}>
          {isLoading ? "Saving…" : "Save changes"}
        </Button>
        <Button disabled={completing.isLoading || reopening.isLoading} onClick={() => void run(task.done ? reopen(task.id) : complete(task.id))}>
          {task.done ? "Reopen task" : "Mark complete"}
        </Button>
        <Button variant="ghost" onClick={onOpenCase}>
          Open case
        </Button>
        <Button
          variant="bad"
          disabled={removing.isLoading}
          onClick={async () => {
            const outcome = await run(remove(task.id), { success: "Task deleted" });
            if (outcome.ok) onDeleted();
          }}
        >
          Delete
        </Button>
      </div>
    </form>
  );
}

export function TaskDrawer({ taskId, onClose, onOpenCase }: TaskDrawerProps) {
  const me = useMe();
  const result = useTaskQuery(taskId);
  const task = result.data;

  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={task?.title ?? "Task"} subtitle={task ? `${task.project} · ${task.clientName}` : ""}>
      {result.isLoading ? <Skeleton rows={4} /> : null}
      {result.isError ? <ErrorState error={result.error} onRetry={() => void result.refetch()} /> : null}
      {task ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={taskStatus(task).tone}>{taskStatus(task).label}</Badge>
            <Badge tone="q">{task.type}</Badge>
            {task.overdue ? <span className="errtxt">Overdue</span> : null}
          </div>
          {can(me, "manageTasks") ? (
            <EditForm key={`${task.id}-${task.done}`} task={task} onOpenCase={() => onOpenCase(task.projectApiId)} onDeleted={onClose} />
          ) : (
            <Button variant="ghost" onClick={() => onOpenCase(task.projectApiId)}>
              Open case
            </Button>
          )}
          <Facts
            items={[
              { label: "Created by", value: task.byName },
              { label: "Created", value: fmtAt(task.createdAt) },
              ...(task.done && task.completedAt ? [{ label: "Completed", value: `${fmtAt(task.completedAt)}${task.completedByName ? ` by ${task.completedByName}` : ""}` }] : []),
            ]}
          />
        </>
      ) : null}
    </Drawer>
  );
}
