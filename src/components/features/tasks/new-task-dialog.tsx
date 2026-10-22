"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { activeStaff, taskSchema, visibleWork } from "@/components/features/tasks/task-helpers";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Field, FieldRow, Input, Select } from "@/components/ui/form";
import { Callout } from "@/components/ui/primitives";
import { PRIORITIES, ROLE_LABEL } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { dISO } from "@/lib/dates";
import { createTask, findDuplicateDocument } from "@/store/actions/cases";
import { userName } from "@/store/selectors";

const schema = taskSchema.extend({ project: z.string().min(1, "Link the task to a case.") });
type Values = z.infer<typeof schema>;

export function NewTaskDialog({ onClose }: { onClose: () => void }) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const { projects } = visibleWork(data, me);
  const open = projects.filter((p) => p.stageIdx < 10 && p.status !== "Completed");
  const cases = [...open, ...projects.filter((p) => !open.includes(p))];
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isValid },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { title: "", project: "", assignee: me.id, priority: "Normal", due: dISO(3), vis: "internal" },
  });

  const [title, projectId] = watch(["title", "project"]);
  const project = projects.find((p) => p.id === projectId);
  const duplicate = project && title ? findDuplicateDocument(data, project.client, title) : null;

  const submit = handleSubmit((values) => {
    const result = dispatch(createTask(values));
    if (result.ok) onClose();
    else if (result.error) setError(/case/i.test(result.error) ? "project" : /assign/i.test(result.error) ? "assignee" : "title", { message: result.error });
  });

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="New task">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <Field label="Task" error={errors.title?.message}>
          {(id, describedBy) => (
            <Input id={id} aria-describedby={describedBy} invalid={Boolean(errors.title)} placeholder="What needs doing" {...register("title")} />
          )}
        </Field>
        {duplicate ? (
          <Callout tone="lock" icon="alert">
            “{duplicate.name}” is already an open document request for this client. Creating this task will be blocked.
          </Callout>
        ) : null}
        <FieldRow>
          <Field label="Case" error={errors.project?.message}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.project)} {...register("project")}>
                <option value="">Select a case</option>
                {cases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {userName(data, p.client)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
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
        </FieldRow>
        <FieldRow>
          <Field label="Priority">
            {(id) => (
              <Select id={id} {...register("priority")}>
                {PRIORITIES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            )}
          </Field>
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
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!isValid}>
            Create task
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
