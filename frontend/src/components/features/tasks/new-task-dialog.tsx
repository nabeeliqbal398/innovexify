"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "@/lib/z";

import { taskSchema } from "@/components/features/tasks/task-helpers";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Field, FieldRow, Input, Select } from "@/components/ui/form";
import { Callout } from "@/components/ui/primitives";
import { PRIORITIES, ROLE_LABEL } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useDebounced } from "@/hooks/useDebounced";
import { useMe } from "@/hooks/useStore";
import { PRIORITY } from "@/lib/api-mappers";
import { useCasesQuery, useCreateTaskMutation } from "@/store/api/cases";
import { useDirectoryQuery } from "@/store/api/people";

const schema = taskSchema.extend({ caseId: z.string().min(1, "Link the task to a case.") });
type Values = z.infer<typeof schema>;

const inDays = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export function NewTaskDialog({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const run = useAction();
  const [create, { isLoading }] = useCreateTaskMutation();
  const staff = useDirectoryQuery().data ?? [];
  const [lookup, setLookup] = useState("");
  const search = useDebounced(lookup.trim(), 300);
  const cases = useCasesQuery({ search, limit: 20, sort: "lastActivityAt", order: "desc" });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isValid },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { title: "", caseId: "", assigneeId: me.id, priority: "Normal", due: inDays(3), vis: "internal" },
  });

  const submit = handleSubmit(async (values) => {
    const outcome = await run(
      create({
        caseId: values.caseId,
        title: values.title,
        assigneeId: values.assigneeId,
        priority: PRIORITY.toKey(values.priority),
        due: values.due,
        visibility: values.vis === "client" ? "CLIENT" : "INTERNAL",
      }),
      { success: "Task created", setError, fields: ["title", "caseId", "assigneeId", "priority", "due", "visibility"] },
    );
    if (outcome.ok) onClose();
  });

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="New task">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <Field label="Task" error={errors.title?.message}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} invalid={Boolean(errors.title)} placeholder="What needs doing" {...register("title")} />}
        </Field>
        <FieldRow>
          <div className="flex flex-col gap-2">
            <Field label="Find a case">
              {(id) => <Input id={id} type="search" placeholder="PRJ number, client or business" value={lookup} onChange={(e) => setLookup(e.target.value)} />}
            </Field>
            <Field label="Case" error={errors.caseId?.message}>
              {(id, describedBy) => (
                <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.caseId)} {...register("caseId")}>
                  <option value="">{cases.isLoading ? "Loading…" : "Select a case"}</option>
                  {(cases.data?.items ?? []).map((p) => (
                    <option key={p.apiId} value={p.apiId}>
                      {p.id} · {p.clientName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label="Assignee" error={errors.assigneeId?.message}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.assigneeId)} {...register("assigneeId")}>
                {staff.map((u) => (
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
        {errors.root?.message ? (
          <Callout tone="warn" icon="alert" role="alert">
            {errors.root.message}
          </Callout>
        ) : null}
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!isValid || isLoading}>
            {isLoading ? "Creating…" : "Create task"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
