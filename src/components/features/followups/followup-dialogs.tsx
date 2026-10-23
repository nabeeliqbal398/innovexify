"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/form";
import { FOLLOW_UP_TYPES } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useDebounced } from "@/hooks/useDebounced";
import { FOLLOW_UP_TYPE } from "@/lib/api-mappers";
import { useCompleteFollowUpMutation, useCreateFollowUpMutation, useCreateInteractionMutation } from "@/store/api/cases";
import { useClientsQuery } from "@/store/api/people";
import type { FollowUp } from "@/types/domain";

interface DialogProps {
  onClose: () => void;
}

const typeSchema = z.enum(FOLLOW_UP_TYPES);
const tomorrow = (): string => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

/**
 * A client picker with its own search box: the list is the server's (a CSR only ever gets their own clients), 20 at a time.
 * `register` is the form's registration of the field that holds the chosen client id.
 */
export function ClientChooser({ register, error }: { register: UseFormRegisterReturn; error?: string }) {
  const [lookup, setLookup] = useState("");
  const search = useDebounced(lookup.trim(), 300);
  const result = useClientsQuery({ search, limit: 20, sort: "name", order: "asc" });
  const options = result.data?.items ?? [];
  return (
    <div className="flex flex-col gap-2">
      <Field label="Find a client">
        {(id) => <Input id={id} type="search" placeholder="Name, email or case ID" value={lookup} onChange={(e) => setLookup(e.target.value)} />}
      </Field>
      <Field label="Client" error={error}>
        {(id, describedBy) => (
          <Select id={id} aria-describedby={describedBy} invalid={Boolean(error)} {...register}>
            <option value="">{result.isLoading ? "Loading…" : "Select a client"}</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.caseId}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  );
}

function TypeSelect({ label, register }: { label: string; register: UseFormRegisterReturn }) {
  return (
    <Field label={label}>
      {(id) => (
        <Select id={id} {...register}>
          {FOLLOW_UP_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
      )}
    </Field>
  );
}

const addSchema = z.object({
  clientId: z.string().min(1, "Choose a client."),
  type: typeSchema,
  due: z.string().min(1, "Choose a due date."),
  note: z.string().trim().min(1, "Add what the follow-up is about.").max(500, "Keep it under 500 characters."),
});
type AddValues = z.infer<typeof addSchema>;

/** Add a follow-up reminder, optionally for a client chosen in advance. */
export function AddFollowupDialog({ clientId, onClose }: DialogProps & { clientId?: string }) {
  const run = useAction();
  const [create, { isLoading }] = useCreateFollowUpMutation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isValid },
  } = useForm<AddValues>({
    resolver: zodResolver(addSchema),
    mode: "onChange",
    defaultValues: { clientId: clientId ?? "", type: "Call", due: tomorrow(), note: "" },
  });

  const submit = handleSubmit(async (values) => {
    const outcome = await run(create({ clientId: values.clientId, type: FOLLOW_UP_TYPE.toKey(values.type), due: values.due, note: values.note }), {
      success: "Reminder added",
      setError,
      fields: ["clientId", "type", "due", "note"],
    });
    if (outcome.ok) onClose();
  });

  return (
    <Modal open wide onOpenChange={(o) => !o && onClose()} title="Add follow-up reminder">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <FieldRow>
          {clientId ? <input type="hidden" {...register("clientId")} /> : <ClientChooser register={register("clientId")} error={errors.clientId?.message} />}
          <TypeSelect label="Type" register={register("type")} />
          <Field label="Due" error={errors.due?.message}>
            {(id, describedBy) => <Input id={id} type="date" aria-describedby={describedBy} invalid={Boolean(errors.due)} {...register("due")} />}
          </Field>
        </FieldRow>
        <Field label="What it's about" error={errors.note?.message}>
          {(id, describedBy) => (
            <Input id={id} aria-describedby={describedBy} invalid={Boolean(errors.note)} placeholder="e.g. Confirm the bank statement upload" {...register("note")} />
          )}
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!isValid || isLoading}>
            {isLoading ? "Adding…" : "Add reminder"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

const completeSchema = z.object({ outcome: z.string().trim().min(1, "Record what happened.").max(2000, "Keep the outcome under 2000 characters.") });
type CompleteValues = z.infer<typeof completeSchema>;

/** Mark a follow-up done and add its outcome to the client's relationship timeline. */
export function CompleteFollowupDialog({ followup, onClose }: DialogProps & { followup: FollowUp | null }) {
  const run = useAction();
  const [complete, { isLoading }] = useCompleteFollowUpMutation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isValid },
  } = useForm<CompleteValues>({ resolver: zodResolver(completeSchema), mode: "onChange", defaultValues: { outcome: "" } });

  const submit = handleSubmit(async (values) => {
    if (!followup) return;
    const outcome = await run(complete({ id: followup.id, outcome: values.outcome }), { success: "Follow-up completed and added to the timeline", setError, fields: ["outcome"] });
    if (outcome.ok) onClose();
  });

  return (
    <Modal
      open={Boolean(followup)}
      onOpenChange={(o) => !o && onClose()}
      title="Complete follow-up"
      description={followup ? `${followup.type} with ${followup.clientName} · ${followup.note}` : undefined}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <Field label="Outcome" error={errors.outcome?.message}>
          {(id, describedBy) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              invalid={Boolean(errors.outcome)}
              placeholder="What happened? This is added to the client's relationship timeline."
              {...register("outcome")}
            />
          )}
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="ok" disabled={!isValid || isLoading}>
            {isLoading ? "Saving…" : "Mark complete"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

const interactionSchema = z.object({
  clientId: z.string().min(1, "Choose a client."),
  kind: typeSchema,
  text: z.string().trim().min(1, "Summarize the interaction.").max(2000, "Keep the summary under 2000 characters."),
});
type InteractionValues = z.infer<typeof interactionSchema>;

/** Record a call, email or meeting that already happened. */
export function InteractionDialog({ clientId, onClose }: DialogProps & { clientId?: string }) {
  const run = useAction();
  const [create, { isLoading }] = useCreateInteractionMutation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isValid },
  } = useForm<InteractionValues>({
    resolver: zodResolver(interactionSchema),
    mode: "onChange",
    defaultValues: { clientId: clientId ?? "", kind: "Call", text: "" },
  });

  const submit = handleSubmit(async (values) => {
    const outcome = await run(create({ clientId: values.clientId, kind: FOLLOW_UP_TYPE.toKey(values.kind), text: values.text }), {
      success: "Interaction recorded",
      setError: setError as never,
      fields: ["clientId", "kind", "text"],
    });
    if (outcome.ok) onClose();
  });

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Record client interaction">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <FieldRow>
          {clientId ? <input type="hidden" {...register("clientId")} /> : <ClientChooser register={register("clientId")} error={errors.clientId?.message} />}
          <TypeSelect label="Type" register={register("kind")} />
        </FieldRow>
        <Field label="Summary" error={errors.text?.message}>
          {(id, describedBy) => (
            <Textarea id={id} aria-describedby={describedBy} invalid={Boolean(errors.text)} placeholder="Client-facing summary. Don't paste document contents." {...register("text")} />
          )}
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!isValid || isLoading}>
            {isLoading ? "Saving…" : "Save interaction"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
