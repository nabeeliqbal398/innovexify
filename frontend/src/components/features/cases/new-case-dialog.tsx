"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "@/lib/z";

import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Field, FieldRow, Input, Select } from "@/components/ui/form";
import { Callout } from "@/components/ui/primitives";
import { FORMATION_STATES, PRIORITIES } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useDebounced } from "@/hooks/useDebounced";
import { PRIORITY } from "@/lib/api-mappers";
import { isDone } from "@/lib/api-mappers";
import { useCreateCaseMutation, useCaseServicesQuery } from "@/store/api/cases";
import { useClientsQuery } from "@/store/api/people";

const schema = z.object({
  clientId: z.string().min(1, "Select a client."),
  serviceId: z.string().min(1, "Select a service."),
  formationState: z.string().min(1, "Select a state."),
  priority: z.enum(["Low", "Normal", "High", "Urgent"]),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a target date."),
  businessName: z.string().max(120, "Keep the business name under 120 characters."),
});
type Values = z.infer<typeof schema>;
const FIELDS = ["clientId", "serviceId", "formationState", "priority", "deadline", "businessName"] as const;

const inDays = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Opens a case for a client who has no open case. The server refuses a second open case for the same client. */
export function NewCaseDialog({ onClose }: { onClose: () => void }) {
  const run = useAction();
  const [create, { isLoading }] = useCreateCaseMutation();
  const [lookup, setLookup] = useState("");
  const search = useDebounced(lookup.trim(), 300);
  const clientsResult = useClientsQuery({ search, limit: 20, sort: "name", order: "asc" });
  const clients = clientsResult.data?.items ?? [];
  const services = (useCaseServicesQuery().data ?? []).filter((s) => s.active);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isValid },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { clientId: "", serviceId: "llc", formationState: "Wyoming", priority: "Normal", deadline: inDays(30), businessName: "" },
  });

  const submit = handleSubmit(async (values) => {
    const outcome = await run(
      create({
        clientId: values.clientId,
        serviceId: values.serviceId,
        priority: PRIORITY.toKey(values.priority),
        deadline: values.deadline,
        formationState: values.formationState,
        businessName: values.businessName.trim() || undefined,
      }),
      { success: "Case created", setError, fields: FIELDS },
    );
    if (outcome.ok) onClose();
  });

  return (
    <Modal
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title="New case"
      description="Opens a case for a client who has no open case. Stage and status are tracked separately."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <FieldRow>
          <div className="flex flex-col gap-2">
            <Field label="Find a client">
              {(id) => <Input id={id} type="search" placeholder="Name, email or case ID" value={lookup} onChange={(e) => setLookup(e.target.value)} />}
            </Field>
            <Field label="Client" error={errors.clientId?.message}>
              {(id, describedBy) => (
                <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.clientId)} {...register("clientId")}>
                  <option value="">{clientsResult.isLoading ? "Loading…" : "Select a client"}</option>
                  {clients.map((c) => {
                    const hasOpen = c.currentCase ? !isDone(c.currentCase) : false;
                    return (
                      <option key={c.id} value={c.id} disabled={hasOpen}>
                        {c.name} · {c.caseId}
                        {hasOpen ? " (has an open case)" : ""}
                      </option>
                    );
                  })}
                </Select>
              )}
            </Field>
          </div>
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
        {clientsResult.data && clients.length > 0 && clients.every((c) => (c.currentCase ? !isDone(c.currentCase) : false)) ? (
          <Callout tone="lock" icon="lock">
            Every client found already has an open case. Search for another client, or invite one from Staff &amp; Invitations.
          </Callout>
        ) : null}
        <FieldRow>
          <Field label="Formation state" error={errors.formationState?.message}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} invalid={Boolean(errors.formationState)} {...register("formationState")}>
                {FORMATION_STATES.map((s) => (
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
        <Field label="Business name (optional)" error={errors.businessName?.message}>
          {(id, describedBy) => <Input id={id} placeholder="If known" aria-describedby={describedBy} invalid={Boolean(errors.businessName)} {...register("businessName")} />}
        </Field>
        {errors.root?.message ? (
          <Callout tone="warn" icon="alert" role="alert">
            {errors.root.message}
          </Callout>
        ) : null}
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!isValid || isLoading}>
            {isLoading ? "Creating…" : "Create case"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
