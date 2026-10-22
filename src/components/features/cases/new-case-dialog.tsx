"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Field, FieldRow, Input, Select } from "@/components/ui/form";
import { Callout } from "@/components/ui/primitives";
import { PRIORITIES } from "@/constants/vocab";
import { useAppDispatch, useData } from "@/hooks/useStore";
import { dISO } from "@/lib/dates";
import { createCase } from "@/store/actions/cases";
import { projectOfClient } from "@/store/selectors";
import { clientUsers } from "./case-data";

const STATES = ["Wyoming", "Delaware", "New Mexico", "Florida", "Texas", "Nevada"] as const;

const schema = z.object({
  client: z.string().min(1, "Select a client."),
  service: z.string().min(1, "Select a service."),
  state: z.string().min(1, "Select a state."),
  priority: z.enum(["Low", "Normal", "High", "Urgent"]),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a target date."),
  biz: z.string().max(120, "Keep the business name under 120 characters."),
});
type Values = z.infer<typeof schema>;

/** Opens a case for a client who doesn't have one yet. */
export function NewCaseDialog({ onClose }: { onClose: () => void }) {
  const data = useData();
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState("");
  const clients = clientUsers(data).filter((c) => !projectOfClient(data, c.id));
  const services = data.services.filter((s) => s.active);
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { client: "", service: "llc", state: "Wyoming", priority: "Normal", deadline: dISO(30), biz: "" },
  });

  const submit = handleSubmit((values) => {
    const result = dispatch(createCase(values));
    if (result.ok) onClose();
    else setFormError(result.error ?? "Could not create the case.");
  });

  return (
    <Modal
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title="New case"
      description="Opens a case for a client who doesn't have one yet. Stage and status are tracked separately."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <FieldRow>
          <Field label="Client" error={errors.client?.message}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.client)} {...register("client")}>
                <option value="">Select a client without a case</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.caseId}
                  </option>
                ))}
              </Select>
            )}
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
        {clients.length === 0 ? (
          <Callout tone="lock" icon="lock">
            Every client already has a case. Invite a client first from Staff &amp; Invitations.
          </Callout>
        ) : null}
        <FieldRow>
          <Field label="Formation state" error={errors.state?.message}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.state)} {...register("state")}>
                {STATES.map((s) => (
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
          <Field label="Target date" error={errors.deadline?.message}>
            {(id, describedBy) => <Input id={id} type="date" aria-describedby={describedBy} invalid={Boolean(errors.deadline)} {...register("deadline")} />}
          </Field>
        </FieldRow>
        <Field label="Business name (optional)" error={errors.biz?.message}>
          {(id, describedBy) => <Input id={id} placeholder="If known" aria-describedby={describedBy} invalid={Boolean(errors.biz)} {...register("biz")} />}
        </Field>
        {formError ? (
          <Callout tone="warn" icon="alert" role="alert">
            {formError}
          </Callout>
        ) : null}
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!isValid || isSubmitting}>
            Create case
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
