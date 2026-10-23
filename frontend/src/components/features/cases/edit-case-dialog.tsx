"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Field, FieldRow, Input, Select } from "@/components/ui/form";
import { Callout } from "@/components/ui/primitives";
import { PRIORITIES } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { CASE_STATUS, EDITABLE_CASE_STATUSES, PRIORITY } from "@/lib/api-mappers";
import { useCaseServicesQuery, useUpdateCaseMutation, type CaseChanges } from "@/store/api/cases";
import { useDirectoryQuery } from "@/store/api/people";
import type { Project } from "@/types/domain";

const schema = z.object({
  status: z.string(),
  priority: z.enum(["Low", "Normal", "High", "Urgent"]),
  deadline: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Enter a valid date."),
  serviceId: z.string().min(1, "Select a service."),
  ownerId: z.string(),
});
type Values = z.infer<typeof schema>;

/**
 * Edit status, priority, target date, service and compliance owner. Stage and CSR have their own controls.
 * `project` is the freshest copy the page has: its `version` goes with the save, and when someone else saved first the
 * server says so and this form keeps what was typed while the page reloads.
 */
export function EditCaseDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const run = useAction();
  const [update, { isLoading }] = useUpdateCaseMutation();
  const owners = useDirectoryQuery({ role: "COMPLIANCE" }).data ?? [];
  const services = (useCaseServicesQuery().data ?? []).filter((s) => s.active || s.id === project.service);
  const statuses = EDITABLE_CASE_STATUSES.includes(project.status) ? EDITABLE_CASE_STATUSES : [project.status, ...EDITABLE_CASE_STATUSES];
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isValid },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      status: project.status,
      priority: project.priority,
      deadline: project.deadline,
      serviceId: project.service,
      ownerId: project.owner ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    // Only what changed goes to the server: it refuses a status the editor cannot set, even when it is the current one.
    const changes: CaseChanges = { version: project.version };
    if (values.status !== project.status) changes.status = CASE_STATUS.toKey(values.status);
    if (values.priority !== project.priority) changes.priority = PRIORITY.toKey(values.priority);
    if (values.deadline !== project.deadline) changes.deadline = values.deadline || null;
    if (values.serviceId !== project.service) changes.serviceId = values.serviceId;
    if (values.ownerId !== (project.owner ?? "")) changes.ownerId = values.ownerId || null;
    const outcome = await run(update({ id: project.apiId, ...changes }), { success: "Case saved", setError, fields: ["status", "priority", "deadline", "serviceId", "ownerId"] });
    if (outcome.ok) onClose();
  });

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Edit case details"
      description={`${project.id} · ${project.clientName}. Stage changes are made from the stage control, not here.`}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <FieldRow>
          <Field label="Status" error={errors.status?.message}>
            {(id) => (
              <Select id={id} {...register("status")}>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Priority">
            {(id) => (
              <Select id={id} {...register("priority")}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Target date" error={errors.deadline?.message}>
            {(id, describedBy) => <Input id={id} type="date" aria-describedby={describedBy} invalid={Boolean(errors.deadline)} {...register("deadline")} />}
          </Field>
          <Field label="Service" error={errors.serviceId?.message}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.serviceId)} {...register("serviceId")}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </FieldRow>
        <Field label="Compliance owner" error={errors.ownerId?.message}>
          {(id) => (
            <Select id={id} {...register("ownerId")}>
              <option value="">Not assigned</option>
              {owners.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <span className="help">The CSR is changed with Reassign CSR so the reassignment rules and history apply.</span>
        {errors.root?.message ? (
          <Callout tone="warn" icon="alert" role="alert">
            {errors.root.message}
          </Callout>
        ) : null}
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!isValid || isLoading}>
            {isLoading ? "Saving…" : "Save changes"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
