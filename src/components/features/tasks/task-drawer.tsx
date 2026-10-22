"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { activeStaff, isOverdue, taskSchema, taskStatus, visibleWork, type TaskValues } from "@/components/features/tasks/task-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { Field, FieldRow, Input, Select } from "@/components/ui/form";
import { Facts } from "@/components/ui/primitives";
import { PRIORITIES, ROLE_LABEL } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { daysFromToday, fmtAt } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { saveTask, toggleTask } from "@/store/actions/cases";
import { userName } from "@/store/selectors";
import type { Task } from "@/types/domain";

interface TaskDrawerProps {
  taskId: number;
  onClose: () => void;
  onOpenCase: (projectId: string) => void;
}

function EditForm({ task, onOpenCase }: { task: Task; onOpenCase: () => void }) {
  const data = useData();
  const dispatch = useAppDispatch();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isValid },
  } = useForm<TaskValues>({
    resolver: zodResolver(taskSchema),
    mode: "onChange",
    defaultValues: { title: task.title, assignee: task.assignee, priority: task.priority, due: task.due, vis: task.vis },
  });

  const submit = handleSubmit((values) => {
    const result = dispatch(saveTask(task.id, values));
    if (!result.ok && result.error) setError("title", { message: result.error });
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
      <Field label="Title" error={errors.title?.message}>
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} invalid={Boolean(errors.title)} {...register("title")} />}
      </Field>
      <FieldRow>
        <Field label="Assignee" error={errors.assignee?.message}>
          {(id, describedBy) => (
            <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.assignee)} {...register("assignee")}>
              {activeStaff(data).map((u) => (
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
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={!isValid}>
          Save changes
        </Button>
        <Button onClick={() => dispatch(toggleTask(task.id))}>{task.done ? "Reopen task" : "Mark complete"}</Button>
        <Button variant="ghost" onClick={onOpenCase}>
          Open case
        </Button>
      </div>
    </form>
  );
}

export function TaskDrawer({ taskId, onClose, onOpenCase }: TaskDrawerProps) {
  const data = useData();
  const me = useMe();
  const task = visibleWork(data, me).tasks.find((t) => t.id === taskId);
  const project = data.projects.find((p) => p.id === task?.project);
  const client = data.users.find((u) => u.id === project?.client);
  if (!task || !project || !client) return null;

  const status = taskStatus(task);
  const late = -daysFromToday(task.due);

  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={task.title} subtitle={`${project.id} · ${client.name} · ${client.caseId ?? ""}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={status.tone}>{status.label}</Badge>
        <Badge tone="q">{task.type}</Badge>
        {isOverdue(task) ? <span className="errtxt">{`Overdue by ${late} day${late === 1 ? "" : "s"}`}</span> : null}
      </div>
      {can(me, "manageTasks") ? <EditForm key={task.id} task={task} onOpenCase={() => onOpenCase(project.id)} /> : null}
      <Facts
        items={[
          { label: "Created by", value: userName(data, task.by) },
          { label: "Created", value: fmtAt(task.createdAt) },
          ...(task.done && task.completedAt ? [{ label: "Completed", value: `Completed ${fmtAt(task.completedAt)}` }] : []),
        ]}
      />
    </Drawer>
  );
}
