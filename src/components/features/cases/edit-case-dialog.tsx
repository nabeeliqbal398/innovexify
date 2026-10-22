"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Field, FieldRow, Input, Select } from "@/components/ui/form";
import { Callout } from "@/components/ui/primitives";
import { CASE_STATUSES, PRIORITIES } from "@/constants/vocab";
import { useAppDispatch, useData } from "@/hooks/useStore";
import { saveCaseEdit } from "@/store/actions/cases";
import { projectById, userName } from "@/store/selectors";

const schema = z.object({
  status: z.enum(["Not Started", "In Progress", "Awaiting Client", "Under Review", "Filing in Progress", "Completed", "On Hold", "Active", "Blocked"]),
  priority: z.enum(["Low", "Normal", "High", "Urgent"]),
  deadline: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Enter a valid date."),
  service: z.string().min(1, "Select a service."),
  owner: z.string(),
});
type Values = z.infer<typeof schema>;

/** Edit status, priority, target date, service and compliance owner. Stage and CSR have their own controls. */
export function EditCaseDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const data = useData();
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState("");
  const project = projectById(data, projectId);
  const owners = data.users.filter((u) => u.role === "COMPLIANCE" && u.status === "Active");
  const services = data.services.filter((s) => s.active || s.id === project?.service);
  const statuses = project && !CASE_STATUSES.includes(project.status) ? [project.status, ...CASE_STATUSES] : CASE_STATUSES;
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      status: project?.status ?? "Active",
      priority: project?.priority ?? "Normal",
      deadline: project?.deadline ?? "",
      service: project?.service ?? "llc",
      owner: project?.owner ?? "",
    },
  });

  const submit = handleSubmit((values) => {
    const result = dispatch(saveCaseEdit(projectId, values));
    if (result.ok) onClose();
    else setFormError(result.error ?? "Could not save the case.");
  });

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Edit case details"
      description={`${projectId} · ${project ? userName(data, project.client) : ""}. Stage changes are made from the stage control, not here.`}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <FieldRow>
          <Field label="Status">
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
          <Field label="Service" error={errors.service?.message}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.service)} {...register("service")}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </FieldRow>
        <Field label="Compliance owner">
          {(id) => (
            <Select id={id} {...register("owner")}>
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
        {formError ? (
          <Callout tone="warn" icon="alert" role="alert">
            {formError}
          </Callout>
        ) : null}
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!isValid || isSubmitting}>
            Save changes
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
